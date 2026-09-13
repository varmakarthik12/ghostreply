package chat

import (
	"strings"
	"testing"
)

func TestSanitizeAndValidateReply(t *testing.T) {
	tests := []struct {
		name       string
		raw        string
		senderName string
		want       string
		wantErr    bool
		errContain string
	}{
		{
			name:    "valid plain reply",
			raw:     "Hey! How is your day going?",
			want:    "Hey! How is your day going?",
			wantErr: false,
		},
		{
			name:    "valid reply with complete think block",
			raw:     "<think>I should ask how they are doing.</think>I'm good, what about you?",
			want:    "I'm good, what about you?",
			wantErr: false,
		},
		{
			name:    "valid reply with complete thinking block",
			raw:     "<thinking>Need to respond casually.</thinking>Not much, just chilling at home!",
			want:    "Not much, just chilling at home!",
			wantErr: false,
		},
		{
			name:    "valid reply with quotes",
			raw:     "\"Hey there!\"",
			want:    "Hey there!",
			wantErr: false,
		},
		{
			name:    "valid reply with heart emoticon",
			raw:     "Thank you so much <3",
			want:    "Thank you so much <3",
			wantErr: false,
		},
		{
			name:    "valid reply with natural word think",
			raw:     "I think we should meet up tomorrow!",
			want:    "I think we should meet up tomorrow!",
			wantErr: false,
		},
		{
			name:    "valid reply with natural word code",
			raw:     "I am writing code for my project right now",
			want:    "I am writing code for my project right now",
			wantErr: false,
		},
		{
			name:       "stray thinking tag with backslash",
			raw:        "<\\thinking> hello there",
			wantErr:    true,
			errContain: "stray thinking tag",
		},
		{
			name:       "stray closing thinking tag",
			raw:        "</thinking> sounds good to me",
			wantErr:    true,
			errContain: "stray thinking tag",
		},
		{
			name:       "unclosed think block",
			raw:        "<think>The user wants to know where I am and I should",
			wantErr:    true,
			errContain: "unclosed thinking tag",
		},
		{
			name:       "unclosed thinking block",
			raw:        "<thinking>Considering response...",
			wantErr:    true,
			errContain: "unclosed thinking tag",
		},
		{
			name:       "code tag with backslash",
			raw:        "Here is what happened <code\\>",
			wantErr:    true,
			errContain: "code tag",
		},
		{
			name:       "standard code tag",
			raw:        "<code>some text</code>",
			wantErr:    true,
			errContain: "code tag",
		},
		{
			name:       "markdown code fence",
			raw:        "```json\n{\"reply\": \"hi\"}\n```",
			wantErr:    true,
			errContain: "code block",
		},
		{
			name:       "cut off tag at end with slash",
			raw:        "I was thinking about you <\\",
			wantErr:    true,
			errContain: "cut-off tag",
		},
		{
			name:       "cut off think tag at end",
			raw:        "I was thinking about you <think",
			wantErr:    true,
			errContain: "cut-off tag",
		},
		{
			name:       "prompt leakage background memory",
			raw:        "Sure! ## Background memory: user lives in Seoul",
			wantErr:    true,
			errContain: "prompt/request leakage",
		},
		{
			name:       "prompt leakage contextual guidelines",
			raw:        "Contextual & Temporal Guidelines: reply briefly",
			wantErr:    true,
			errContain: "prompt/request leakage",
		},
		{
			name:       "prompt leakage received snap",
			raw:        "[Received Snap/Image: selfie of friend] Nice photo!",
			wantErr:    true,
			errContain: "prompt/request leakage",
		},
		{
			name:       "prompt leakage special token im_start",
			raw:        "<|im_start|>assistant\nHey there!",
			wantErr:    true,
			errContain: "prompt/request leakage",
		},
		{
			name:       "speaker prefix assistant",
			raw:        "Assistant: Hey there, how are you?",
			wantErr:    true,
			errContain: "speaker prefix",
		},
		{
			name:       "speaker prefix in brackets",
			raw:        "[User]: What's up?",
			wantErr:    true,
			errContain: "speaker prefix",
		},
		{
			name:       "sender name prefix in brackets",
			raw:        "[MeeffFriend]: Hello!",
			senderName: "MeeffFriend",
			wantErr:    true,
			errContain: "sender prompt prefix",
		},
		{
			name:       "sender name prefix with colon",
			raw:        "MeeffFriend: Hello!",
			senderName: "MeeffFriend",
			wantErr:    true,
			errContain: "sender prompt prefix",
		},
		{
			name:       "empty reply",
			raw:        "   ",
			wantErr:    true,
			errContain: "empty",
		},
		{
			name:       "only thinking block and nothing else",
			raw:        "<think>Only thinking here</think>",
			wantErr:    true,
			errContain: "empty after stripping",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := SanitizeAndValidateReply(tt.raw, tt.senderName)
			if (err != nil) != tt.wantErr {
				t.Fatalf("SanitizeAndValidateReply(%q) error = %v, wantErr %v", tt.raw, err, tt.wantErr)
			}
			if tt.wantErr {
				if tt.errContain != "" && !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(tt.errContain)) {
					t.Errorf("error %q does not contain %q", err.Error(), tt.errContain)
				}
			} else {
				if got != tt.want {
					t.Errorf("got %q, want %q", got, tt.want)
				}
			}
		})
	}
}
