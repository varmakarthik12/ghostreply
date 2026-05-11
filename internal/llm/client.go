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

type Stats struct {
	PromptTokens     int   `json:"prompt_tokens"`
	CompletionTokens int   `json:"completion_tokens"`
	TotalTokens      int   `json:"total_tokens"`
	DurationMs       int64 `json:"duration_ms"`
}

// Client speaks to either an Ollama server (POST /api/chat) or any OpenAI-compatible
// endpoint (POST /v1/chat/completions).
type Client struct {
	BaseURL string
	APIKey  string
	HTTP    *http.Client
}

func NewClient(baseURL, apiKey string, timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 5 * time.Minute
	}
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		HTTP:    &http.Client{Timeout: timeout},
	}
}

// Chat sends messages to the model and returns the assistant reply.
// Auto-detects Ollama vs OpenAI-compatible based on whether BaseURL contains "v1" or APIKey is set.
func (c *Client) Chat(ctx context.Context, model string, msgs []Message, contextSize int) (string, Stats, error) {
	if c.useOpenAI() {
		return c.chatOpenAI(ctx, model, msgs, contextSize)
	}
	return c.chatOllama(ctx, model, msgs, contextSize)
}

// EstimateTokens provides a rough estimate of token count for a list of messages.
func EstimateTokens(msgs []Message) int {
	t := 0
	for _, m := range msgs {
		// Heuristic: 4 characters per token + some overhead for role/formatting
		t += (len(m.Content) + len(m.Role) + 12) / 4
	}
	return t
}

func (c *Client) useOpenAI() bool {
	return c.APIKey != "" || strings.Contains(c.BaseURL, "/v1") || strings.Contains(c.BaseURL, "openai")
}

func (c *Client) chatOllama(ctx context.Context, model string, msgs []Message, contextSize int) (string, Stats, error) {
	payload := map[string]interface{}{
		"model":    model,
		"messages": msgs,
		"stream":   false,
	}
	if contextSize > 0 {
		payload["options"] = map[string]interface{}{
			"num_ctx": contextSize,
		}
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return "", Stats{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	stats := Stats{PromptTokens: EstimateTokens(msgs)}
	
	start := time.Now()
	resp, err := c.HTTP.Do(req)
	duration := time.Since(start).Milliseconds()
	if err != nil {
		return "", stats, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", stats, fmt.Errorf("ollama %d: %s", resp.StatusCode, string(raw))
	}
	var out struct {
		Message          Message `json:"message"`
		PromptEvalCount  int     `json:"prompt_eval_count"`
		EvalCount        int     `json:"eval_count"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", stats, fmt.Errorf("decode: %w (body=%s)", err, string(raw))
	}
	stats = Stats{
		PromptTokens:     out.PromptEvalCount,
		CompletionTokens: out.EvalCount,
		TotalTokens:      out.PromptEvalCount + out.EvalCount,
		DurationMs:       duration,
	}
	return strings.TrimSpace(out.Message.Content), stats, nil
}

func (c *Client) chatOpenAI(ctx context.Context, model string, msgs []Message, contextSize int) (string, Stats, error) {
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
		return "", Stats{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	}
	stats := Stats{PromptTokens: EstimateTokens(msgs)}
	
	start := time.Now()
	resp, err := c.HTTP.Do(req)
	duration := time.Since(start).Milliseconds()
	if err != nil {
		return "", stats, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", stats, fmt.Errorf("openai %d: %s", resp.StatusCode, string(raw))
	}
	var out struct {
		Choices []struct {
			Message Message `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", stats, fmt.Errorf("decode: %w (body=%s)", err, string(raw))
	}
	if len(out.Choices) == 0 {
		return "", stats, fmt.Errorf("no choices returned")
	}
	stats = Stats{
		PromptTokens:     out.Usage.PromptTokens,
		CompletionTokens: out.Usage.CompletionTokens,
		TotalTokens:      out.Usage.TotalTokens,
		DurationMs:       duration,
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), stats, nil
}

func (c *Client) ListModels(ctx context.Context) ([]string, error) {
	if c.useOpenAI() {
		// For OpenAI, we could call /v1/models but it's often too many or not useful
		// for this specific app's context. We'll just return nil for now.
		return nil, nil
	}

	req, err := http.NewRequestWithContext(ctx, "GET", c.BaseURL+"/api/tags", nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ollama models status %d", resp.StatusCode)
	}

	var out struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}

	var names []string
	for _, m := range out.Models {
		names = append(names, m.Name)
	}
	return names, nil
}

