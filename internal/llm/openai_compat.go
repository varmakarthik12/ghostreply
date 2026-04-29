package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type openAIReq struct {
	Model    string        `json:"model"`
	Messages []openAIMsg   `json:"messages"`
	MaxTokens int          `json:"max_tokens,omitempty"`
}

type openAIMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIResp struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

type OpenAICompatProvider struct {
	BaseURL    string
	ModelName  string
	APIKey     string
	CtxWindow  int
	HTTPClient *http.Client
}

func NewOpenAICompatProvider(baseURL, modelName, apiKey string, ctxWindow int) *OpenAICompatProvider {
	if ctxWindow <= 0 { ctxWindow = 8192 }
	return &OpenAICompatProvider{
		BaseURL:   strings.TrimRight(baseURL, "/"),
		ModelName: modelName,
		APIKey:    apiKey,
		CtxWindow: ctxWindow,
		HTTPClient: &http.Client{Timeout: 5 * time.Minute},
	}
}

func (p *OpenAICompatProvider) Chat(ctx context.Context, systemPrompt string, messages []Turn) (string, error) {
	msg := make([]openAIMsg, 0, len(messages)+1)
	if systemPrompt != "" {
		msg = append(msg, openAIMsg{Role: "system", Content: systemPrompt})
	}
	for _, m := range messages {
		msg = append(msg, openAIMsg{Role: m.Role, Content: m.Content})
	}
	body, _ := json.Marshal(openAIReq{Model: p.ModelName, Messages: msg})
	req, err := http.NewRequestWithContext(ctx, "POST", p.BaseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil { return "", err }
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)
	resp, err := p.HTTPClient.Do(req)
	if err != nil { return "", err }
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("openai compat error: status %d", resp.StatusCode)
	}
	var result openAIResp
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}
	return result.Choices[0].Message.Content, nil
}

func (p *OpenAICompatProvider) EstimateTokens(text string) int { return len(text) / 4 }
func (p *OpenAICompatProvider) ContextWindow() int { return p.CtxWindow }
