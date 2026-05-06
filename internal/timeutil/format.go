package timeutil

import (
	"fmt"
	"time"
)

// FormatAge returns a human-readable relative age string for a given time.
// e.g. "just now", "5m ago", "3h ago", "2 day(s) ago (Monday Jan 2)"
func FormatAge(t time.Time, now time.Time) string {
	d := now.Sub(t)
	switch {
	case d < 0:
		return "in the future"
	case d < 2*time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		days := int(d.Hours() / 24)
		return fmt.Sprintf("%d day(s) ago (sent %s)", days, t.Format("Monday Jan 2, 15:04"))
	}
}

// FormatNow returns the current time in a clear, LLM-readable format.
func FormatNow(now time.Time) string {
	return now.Format("Monday, January 2 2006 at 15:04 MST")
}
