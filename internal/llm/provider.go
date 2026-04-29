package llm

import "context"

type Turn struct {
	Role    string // user|assistant
	Content string
}

type Provider interface {
	Chat(ctx context.Context, systemPrompt string, messages []Turn) (string, error)
	EstimateTokens(text string) int
	ContextWindow() int
}
