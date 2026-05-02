package ui

import "testing"

func TestEmbeddedUI(t *testing.T) {
	// Simple check to see if EmbeddedUI is accessible by listing its root
	_, err := EmbeddedUI.ReadDir(".")
	if err != nil {
		t.Errorf("failed to read embedded UI: %v", err)
	}
}
