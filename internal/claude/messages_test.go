package claude

import (
	"strings"
	"testing"
)

func TestSystemPrompt(t *testing.T) {
	if systemPrompt("en") == "" || systemPrompt("fa") == "" {
		t.Fatal("expected prompts")
	}
	if !strings.Contains(systemPrompt("en"), "PAID") {
		t.Fatal("expected paid guard in prompt")
	}
}
