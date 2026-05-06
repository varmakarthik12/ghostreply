package timeutil

import (
	"testing"
	"time"
)

func TestFormatAge(t *testing.T) {
	now := time.Date(2023, 10, 10, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name     string
		sentAt   time.Time
		expected string
	}{
		{
			name:     "Just now",
			sentAt:   now.Add(-1 * time.Minute),
			expected: "just now",
		},
		{
			name:     "Minutes ago",
			sentAt:   now.Add(-15 * time.Minute),
			expected: "15m ago",
		},
		{
			name:     "Hours ago",
			sentAt:   now.Add(-3 * time.Hour),
			expected: "3h ago",
		},
		{
			name:     "Days ago",
			sentAt:   now.Add(-48 * time.Hour),
			expected: "2 day(s) ago (sent Monday Oct 8, 12:00)",
		},
		{
			name:     "Future",
			sentAt:   now.Add(1 * time.Minute),
			expected: "in the future",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FormatAge(tt.sentAt, now)
			if got != tt.expected {
				t.Errorf("FormatAge() = %v, want %v", got, tt.expected)
			}
		})
	}
}
