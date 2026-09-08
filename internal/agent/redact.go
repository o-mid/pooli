package agent

import "strings"

var piiFieldKeys = map[string]bool{
	"phone":            true,
	"email":            true,
	"shipping_address": true,
	"postal_code":      true,
	"full_name":        true,
	"customer_note":    true,
}

// RedactFieldValues removes buyer PII from order field snapshots.
func RedactFieldValues(values []map[string]any) []map[string]any {
	if len(values) == 0 {
		return []map[string]any{}
	}
	out := make([]map[string]any, 0, len(values))
	for _, v := range values {
		key, _ := v["key"].(string)
		if piiFieldKeys[strings.ToLower(strings.TrimSpace(key))] {
			continue
		}
		out = append(out, v)
	}
	return out
}
