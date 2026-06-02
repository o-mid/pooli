package otp

import "testing"

func TestNormalizeIranianPhone(t *testing.T) {
	cases := map[string]string{
		"09121234567":     "+989121234567",
		"9121234567":      "+989121234567",
		"+989121234567":   "+989121234567",
		"00989121234567":  "+989121234567",
		"98 912 123 4567": "+989121234567",
	}
	for in, want := range cases {
		got, err := NormalizeIranianPhone(in)
		if err != nil {
			t.Fatalf("%s: %v", in, err)
		}
		if got != want {
			t.Fatalf("%s: got %s want %s", in, got, want)
		}
	}
	for _, bad := range []string{"02112345678", "0912123456", "abc", "", "0989121234567"} {
		if _, err := NormalizeIranianPhone(bad); err == nil {
			t.Fatalf("expected error for %q", bad)
		}
	}
}
