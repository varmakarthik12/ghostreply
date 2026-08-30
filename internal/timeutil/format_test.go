package timeutil

import (
	"strings"
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
			expected: "2 day(s) ago (sent Sunday Oct 8, 12:00)",
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

func TestResolveLocation(t *testing.T) {
	locUTC := ResolveLocation("UTC")
	if locUTC != time.UTC {
		t.Errorf("expected UTC, got %v", locUTC)
	}

	locNY := ResolveLocation("America/New_York")
	if locNY.String() != "America/New_York" {
		t.Errorf("expected America/New_York, got %v", locNY)
	}

	locInvalid := ResolveLocation("Invalid/Non_Existent")
	if locInvalid != time.Local {
		t.Errorf("expected fallback to time.Local, got %v", locInvalid)
	}

	locEmpty := ResolveLocation("")
	if locEmpty != time.Local {
		t.Errorf("expected fallback to time.Local for empty, got %v", locEmpty)
	}
}

func TestGetTimeOfDay(t *testing.T) {
	tests := []struct {
		hour     int
		expected string
	}{
		{2, "Late Night"},
		{6, "Early Morning"},
		{10, "Morning"},
		{14, "Afternoon"},
		{19, "Evening"},
		{22, "Night"},
	}

	for _, tt := range tests {
		d := time.Date(2026, 8, 30, tt.hour, 30, 0, 0, time.UTC)
		period, _ := GetTimeOfDay(d)
		if period != tt.expected {
			t.Errorf("hour %d: expected %s, got %s", tt.hour, tt.expected, period)
		}
	}
}

func TestBuildTimeContext(t *testing.T) {
	refTime := time.Date(2026, 8, 30, 3, 15, 0, 0, time.UTC)
	ctxStr := BuildTimeContext(refTime, "New York, USA", "UTC")

	if !strings.Contains(ctxStr, "Real-time temporal and location context") {
		t.Errorf("missing header in: %s", ctxStr)
	}
	if !strings.Contains(ctxStr, "Late Night") {
		t.Errorf("expected Late Night in: %s", ctxStr)
	}
	if !strings.Contains(ctxStr, "New York, USA") {
		t.Errorf("expected location in: %s", ctxStr)
	}
}
