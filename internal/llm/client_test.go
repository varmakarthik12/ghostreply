package llm

import "testing"

func TestNewClient(t *testing.T) {
	c := NewClient("http://localhost:11434", "key")
	if c.BaseURL != "http://localhost:11434" {
		t.Errorf("url: %s", c.BaseURL)
	}
}
