package agent

import "testing"

func TestRedactFieldValuesStripsPII(t *testing.T) {
	in := []map[string]any{
		{"key": "phone", "value": "+15551212"},
		{"key": "size", "value": "L"},
	}
	out := RedactFieldValues(in)
	if len(out) != 1 {
		t.Fatalf("got %d fields, want 1", len(out))
	}
	if out[0]["key"] != "size" {
		t.Fatalf("unexpected key %v", out[0]["key"])
	}
}
