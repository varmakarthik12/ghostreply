package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Client speaks to either an Ollama server (POST /api/chat) or any OpenAI-compatible
// endpoint (POST /v1/chat/completions).
type Client struct {
	BaseURL string
	APIKey  string
	HTTP    *http.Client
}

func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		HTTP:    &http.Client{Timeout: 5 * time.Minute},
	}
}

// Chat sends messages to the model and returns the assistant reply.
// Auto-detects Ollama vs OpenAI-compatible based on whether BaseURL contains "v1" or APIKey is set.
func (c *Client) Chat(ctx context.Context, model string, msgs []Message) (string, error) {
	if c.useOpenAI() {
		return c.chatOpenAI(ctx, model, msgs)
	}
	return c.chatOllama(ctx, model, msgs)
}

func (c *Client) useOpenAI() bool {
	return c.APIKey != "" || strings.Contains(c.BaseURL, "/v1") || strings.Contains(c.BaseURL, "openai")
}

func (c *Client) chatOllama(ctx context.Context, model string, msgs []Message) (string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"model":    model,
		"messages": msgs,
		"stream":   false,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("ollama %d: %s", resp.StatusCode, string(raw))
	}
	var out struct {
		Message Message `json:"message"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("decode: %w (body=%s)", err, string(raw))
	}
	return strings.TrimSpace(out.Message.Content), nil
}

func (c *Client) chatOpenAI(ctx context.Context, model string, msgs []Message) (string, error) {
	url := c.BaseURL
	if !strings.Contains(url, "/chat/completions") {
		if !strings.Contains(url, "/v1") {
			url += "/v1"
		}
		url += "/chat/completions"
	}
	body, _ := json.Marshal(map[string]interface{}{
		"model":    model,
		"messages": msgs,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("openai %d: %s", resp.StatusCode, string(raw))
	}
	var out struct {
		Choices []struct {
			Message Message `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("decode: %w (body=%s)", err, string(raw))
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("no choices returned")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}
