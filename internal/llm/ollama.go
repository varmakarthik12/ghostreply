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

type ollamaReq struct {
	Model    string           `json:"model"`
	Messages []ollamaMessage  `json:"messages"`
	Stream   bool             `json:"stream"`
}

type ollamaMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ollamaResp struct {
	Message ollamaMessage `json:"message"`
}

type OllamaProvider struct {
	BaseURL     string
	ModelName   string
	HTTPClient  *http.Client
	CtxWindow   int
}

func NewOllamaProvider(baseURL, modelName string, ctxWindow int) *OllamaProvider {
	if ctxWindow <= 0 { ctxWindow = 8192 }
	return &OllamaProvider{
		BaseURL:   strings.TrimRight(baseURL, "/"),
		ModelName: modelName,
		CtxWindow: ctxWindow,
		HTTPClient: &http.Client{Timeout: 5 * time.Minute},
	}
}

func (p *OllamaProvider) Chat(ctx context.Context, systemPrompt string, messages []Turn) (string, error) {
	ollamaMsgs := make([]ollamaMessage, 0, len(messages)+1)
	if systemPrompt != "" {
		ollamaMsgs = append(ollamaMsgs, ollamaMessage{Role: "system", Content: systemPrompt})
	}
	for _, m := range messages {
		ollamaMsgs = append(ollamaMsgs, ollamaMessage{Role: m.Role, Content: m.Content})
	}
	body, _ := json.Marshal(ollamaReq{Model: p.ModelName, Messages: ollamaMsgs, Stream: false})
	req, err := http.NewRequestWithContext(ctx, "POST", p.BaseURL+"/api/chat", bytes.NewReader(body))
	if err != nil { return "", err }
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.HTTPClient.Do(req)
	if err != nil { return "", err }
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("ollama error: status %d", resp.StatusCode)
	}
	var result ollamaResp
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	return result.Message.Content, nil
}

func (p *OllamaProvider) EstimateTokens(text string) int {
	return len(text) / 4
}

func (p *OllamaProvider) ContextWindow() int {
	return p.CtxWindow
}
