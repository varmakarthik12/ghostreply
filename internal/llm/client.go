package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Message struct {
	Role    string         `json:"role"`
	Content string         `json:"content"`
	Images  []string       `json:"images,omitempty"`
	Audios  []AudioContent `json:"audios,omitempty"`
}

type AudioContent struct {
	Data   string `json:"data"`
	Format string `json:"format"`
}

type Stats struct {
	PromptTokens     int   `json:"prompt_tokens"`
	CompletionTokens int   `json:"completion_tokens"`
	TotalTokens      int   `json:"total_tokens"`
	DurationMs       int64 `json:"duration_ms"`
}

// SamplingParams holds generation sampling hyperparameters.
// Zero values mean "use the caller's default" (defaults are applied in ResolveLLMClient).
type SamplingParams struct {
	Temperature       float64
	TopP              float64
	TopK              int
	MinP              float64
	RepetitionPenalty float64
	// ThinkingLevel: "none" | "low" | "medium" | "high" | raw integer string (custom budget_tokens)
	ThinkingLevel string
}

// thinkingBudget converts a ThinkingLevel string to a budget_tokens integer.
// Returns -1 when thinking should be disabled (level == "none").
// Returns 0 when no thinking config should be emitted (empty).
func thinkingBudget(level string) int {
	switch strings.ToLower(level) {
	case "none":
		return -1
	case "low":
		return 512
	case "medium":
		return 2048
	case "high":
		return 8192
	case "":
		return 0
	default:
		// Try to parse as a raw integer (custom budget)
		if n, err := strconv.Atoi(level); err == nil && n > 0 {
			return n
		}
		return 0
	}
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
func (c *Client) Chat(ctx context.Context, model string, msgs []Message, contextSize int, params SamplingParams) (string, Stats, error) {
	if c.useOpenAI() {
		return c.chatOpenAI(ctx, model, msgs, contextSize, params)
	}
	return c.chatOllama(ctx, model, msgs, contextSize, params)
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

func (c *Client) chatOllama(ctx context.Context, model string, msgs []Message, contextSize int, params SamplingParams) (string, Stats, error) {
	options := map[string]interface{}{
		"temperature":    params.Temperature,
		"top_p":          params.TopP,
		"top_k":          params.TopK,
		"min_p":          params.MinP,
		"repeat_penalty": params.RepetitionPenalty,
	}
	if contextSize > 0 {
		options["num_ctx"] = contextSize
	}
	payload := map[string]interface{}{
		"model":    model,
		"messages": msgs,
		"stream":   false,
		"options":  options,
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
		Message         Message `json:"message"`
		PromptEvalCount int     `json:"prompt_eval_count"`
		EvalCount       int     `json:"eval_count"`
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

func (c *Client) chatOpenAI(ctx context.Context, model string, msgs []Message, contextSize int, params SamplingParams) (string, Stats, error) {
	url := c.BaseURL
	if !strings.Contains(url, "/chat/completions") {
		if !strings.Contains(url, "/v1") {
			url += "/v1"
		}
		url += "/chat/completions"
	}

	type openAIImageURL struct {
		URL string `json:"url"`
	}
	type openAIAudio struct {
		Data   string `json:"data"`
		Format string `json:"format"`
	}
	type openAIMessagePart struct {
		Type       string          `json:"type"`
		Text       string          `json:"text,omitempty"`
		ImageURL   *openAIImageURL `json:"image_url,omitempty"`
		InputAudio *openAIAudio    `json:"input_audio,omitempty"`
	}
	type openAIMessage struct {
		Role    string      `json:"role"`
		Content interface{} `json:"content"`
	}

	var openAIMsgs []openAIMessage
	for _, m := range msgs {
		if len(m.Images) > 0 || len(m.Audios) > 0 {
			parts := []openAIMessagePart{}
			if m.Content != "" {
				parts = append(parts, openAIMessagePart{
					Type: "text",
					Text: m.Content,
				})
			}
			for _, img := range m.Images {
				prefix := ""
				if !strings.HasPrefix(img, "data:") {
					prefix = "data:image/jpeg;base64,"
				}
				parts = append(parts, openAIMessagePart{
					Type: "image_url",
					ImageURL: &openAIImageURL{
						URL: prefix + img,
					},
				})
			}
			for _, aud := range m.Audios {
				parts = append(parts, openAIMessagePart{
					Type: "input_audio",
					InputAudio: &openAIAudio{
						Data:   aud.Data,
						Format: aud.Format,
					},
				})
			}
			openAIMsgs = append(openAIMsgs, openAIMessage{
				Role:    m.Role,
				Content: parts,
			})
		} else {
			openAIMsgs = append(openAIMsgs, openAIMessage{
				Role:    m.Role,
				Content: m.Content,
			})
		}
	}

	reqBody := map[string]interface{}{
		"model":              model,
		"messages":           openAIMsgs,
		"temperature":        params.Temperature,
		"top_p":              params.TopP,
		"top_k":              params.TopK,
		"min_p":              params.MinP,
		"repetition_penalty": params.RepetitionPenalty,
	}

	// Thinking-capable models: inject thinking config
	budget := thinkingBudget(params.ThinkingLevel)
	if budget < 0 {
		// Explicitly disable thinking
		reqBody["thinking"] = map[string]interface{}{
			"type": "disabled",
		}
	} else if budget > 0 {
		reqBody["thinking"] = map[string]interface{}{
			"type":          "enabled",
			"budget_tokens": budget,
		}
	}

	body, _ := json.Marshal(reqBody)
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
			Message      Message `json:"message"`
			FinishReason string  `json:"finish_reason"`
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
	// Reject incomplete responses. finish_reason must be "stop" or "end_turn";
	// anything else ("length", "content_filter", empty string, etc.) means the
	// model did not finish naturally and the content may be partial or corrupted
	// (e.g. unclosed <thinking> blocks leaking into the reply).
	finishReason := out.Choices[0].FinishReason
	if finishReason != "stop" && finishReason != "end_turn" {
		return "", stats, fmt.Errorf("incomplete response: finish_reason=%q (expected \"stop\" or \"end_turn\")", finishReason)
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
