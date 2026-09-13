package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewClient(t *testing.T) {
	c := NewClient("http://localhost:11434", "key", 0)
	if c.BaseURL != "http://localhost:11434" {
		t.Errorf("url: %s", c.BaseURL)
	}
}

func TestOpenAIFinishReasonLength(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{
			"choices": []map[string]interface{}{
				{
					"message": map[string]string{
						"role":    "assistant",
						"content": "Incomplete sentence that cut off...",
					},
					"finish_reason": "length",
				},
			},
			"usage": map[string]int{
				"prompt_tokens":     10,
				"completion_tokens": 5,
				"total_tokens":      15,
			},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	c := NewClient(server.URL+"/v1", "test-key", 0)
	_, _, err := c.Chat(context.Background(), "gpt-4", []Message{{Role: "user", Content: "hi"}}, 0, SamplingParams{})
	if err == nil {
		t.Fatal("expected error when finish_reason is length, got nil")
	}
	if !strings.Contains(err.Error(), "finish_reason=length") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestOpenAIFinishReasonStop(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{
			"choices": []map[string]interface{}{
				{
					"message": map[string]string{
						"role":    "assistant",
						"content": "Complete response.",
					},
					"finish_reason": "stop",
				},
			},
			"usage": map[string]int{
				"prompt_tokens":     10,
				"completion_tokens": 5,
				"total_tokens":      15,
			},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	c := NewClient(server.URL+"/v1", "test-key", 0)
	reply, _, err := c.Chat(context.Background(), "gpt-4", []Message{{Role: "user", Content: "hi"}}, 0, SamplingParams{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if reply != "Complete response." {
		t.Fatalf("got %q, want %q", reply, "Complete response.")
	}
}

func TestOllamaDoneReasonLength(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{
			"message": map[string]string{
				"role":    "assistant",
				"content": "Cut off mid sentence",
			},
			"done_reason":        "length",
			"done":               true,
			"prompt_eval_count": 8,
			"eval_count":        5,
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	c := NewClient(server.URL, "", 0) // No /v1 and no API key -> Ollama
	_, _, err := c.Chat(context.Background(), "llama3", []Message{{Role: "user", Content: "hi"}}, 0, SamplingParams{})
	if err == nil {
		t.Fatal("expected error when done_reason is length, got nil")
	}
	if !strings.Contains(err.Error(), "done_reason=length") {
		t.Fatalf("unexpected error message: %v", err)
	}
}
