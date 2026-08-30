package timeutil

import (
	"fmt"
	"strings"
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

// ResolveLocation returns the *time.Location for a given timezone name.
// Falls back to time.Local if tzName is empty or invalid.
func ResolveLocation(tzName string) *time.Location {
	tzName = strings.TrimSpace(tzName)
	if tzName == "" || strings.EqualFold(tzName, "local") {
		return time.Local
	}
	if strings.EqualFold(tzName, "utc") {
		return time.UTC
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		return time.Local
	}
	return loc
}

// GetTimeOfDay returns the time of day period (e.g., "Late Night", "Morning")
// and a short situational description for real-world context.
func GetTimeOfDay(t time.Time) (period string, description string) {
	hour := t.Hour()
	switch {
	case hour >= 0 && hour < 5:
		return "Late Night", "usually sleeping, winding down in bed, or staying up late"
	case hour >= 5 && hour < 8:
		return "Early Morning", "waking up, morning routine, early start"
	case hour >= 8 && hour < 12:
		return "Morning", "daytime activities, work, classes, starting the day"
	case hour >= 12 && hour < 17:
		return "Afternoon", "daytime activities, lunch, work, afternoon flow"
	case hour >= 17 && hour < 21:
		return "Evening", "evening winding down, dinner, relaxing after the day"
	default:
		return "Night", "nighttime, relaxing, preparing for sleep"
	}
}

// BuildTimeContext creates a formatted prompt block detailing the real-world temporal
// and location context for the AI.
func BuildTimeContext(now time.Time, userLocation, tzName string) string {
	loc := ResolveLocation(tzName)
	localTime := now.In(loc)
	period, desc := GetTimeOfDay(localTime)

	timeStr := localTime.Format("Monday, Jan 2, 2006, 3:04 PM (MST)")
	dayName := localTime.Format("Monday")

	var sb strings.Builder
	sb.WriteString("## Real-time temporal and location context\n")
	sb.WriteString(fmt.Sprintf("- Current local time: %s\n", timeStr))
	sb.WriteString(fmt.Sprintf("- Time of day: %s (%s)\n", period, desc))
	sb.WriteString(fmt.Sprintf("- Day of week: %s\n", dayName))

	trimmedLoc := strings.TrimSpace(userLocation)
	trimmedTz := strings.TrimSpace(tzName)

	if trimmedLoc != "" {
		if trimmedTz != "" && !strings.EqualFold(trimmedTz, "local") {
			sb.WriteString(fmt.Sprintf("- User/Host location: %s (Timezone: %s)\n", trimmedLoc, trimmedTz))
		} else {
			sb.WriteString(fmt.Sprintf("- User/Host location: %s\n", trimmedLoc))
		}
	} else if trimmedTz != "" && !strings.EqualFold(trimmedTz, "local") {
		sb.WriteString(fmt.Sprintf("- Timezone: %s\n", trimmedTz))
	}

	return sb.String()
}
