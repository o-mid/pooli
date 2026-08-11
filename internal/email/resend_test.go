package email

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestResendSendSuccess(t *testing.T) {
	var gotAuth, gotUA, gotIdem string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotUA = r.Header.Get("User-Agent")
		gotIdem = r.Header.Get("Idempotency-Key")
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), "re_secret") {
			t.Fatal("api key leaked into body")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "msg_123"})
	}))
	defer srv.Close()

	r := &Resend{
		APIKey:  "re_secret_test_key",
		From:    "Pooli <notifications@notify.pooli.shop>",
		ReplyTo: "support@pooli.shop",
		APIBase: srv.URL,
	}
	res, err := r.Send(context.Background(), Message{
		To: "buyer@example.com", Subject: "Payment received ✓",
		HTML: "<p>ok</p>", Text: "ok", EventKey: "payment.paid:abc:merchant",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.ProviderMessageID != "msg_123" {
		t.Fatalf("id=%q", res.ProviderMessageID)
	}
	if gotAuth != "Bearer re_secret_test_key" {
		t.Fatalf("auth=%q", gotAuth)
	}
	if gotUA == "" {
		t.Fatal("missing User-Agent")
	}
	if gotIdem != "payment.paid:abc:merchant" {
		t.Fatalf("idem=%q", gotIdem)
	}
}

func TestResendRetryableStatuses(t *testing.T) {
	cases := []struct {
		code int
		cat  ErrCategory
	}{
		{429, CategoryTransient},
		{500, CategoryTransient},
		{400, CategoryPermanent},
		{401, CategoryPermanent},
		{403, CategoryPermanent},
		{422, CategoryPermanent},
	}
	for _, tc := range cases {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(tc.code)
			_, _ = w.Write([]byte(`{"message":"nope"}`))
		}))
		r := &Resend{APIKey: "re_x", From: "Pooli <a@b.c>", APIBase: srv.URL}
		_, err := r.Send(context.Background(), Message{To: "a@b.c", Subject: "x", Text: "x"})
		srv.Close()
		if err == nil {
			t.Fatalf("status %d expected error", tc.code)
		}
		if CategoryOf(err) != tc.cat {
			t.Fatalf("status %d category=%s want %s err=%v", tc.code, CategoryOf(err), tc.cat, err)
		}
		if strings.Contains(err.Error(), "re_x") {
			t.Fatalf("api key leaked in error: %v", err)
		}
	}
}

func TestResendTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "late"})
	}))
	defer srv.Close()
	r := &Resend{
		APIKey: "re_x", From: "Pooli <a@b.c>", APIBase: srv.URL,
		HTTP: &http.Client{Timeout: 20 * time.Millisecond},
	}
	_, err := r.Send(context.Background(), Message{To: "a@b.c", Subject: "x", Text: "x"})
	if err == nil {
		t.Fatal("expected timeout")
	}
	if !IsRetryable(err) {
		t.Fatalf("timeout should be retryable: %v", err)
	}
	if strings.Contains(err.Error(), "re_x") {
		t.Fatal("api key in error")
	}
}

func TestSanitizeAddressRejectsInjection(t *testing.T) {
	if _, err := SanitizeAddress("a@b.com\nBcc: evil@x.com"); err == nil {
		t.Fatal("expected injection rejection")
	}
	if _, err := SanitizeAddress("not-an-email"); err == nil {
		t.Fatal("expected invalid")
	}
	got, err := SanitizeAddress("  Buyer Name <buyer@example.com> ")
	if err != nil || got != "buyer@example.com" {
		t.Fatalf("got %q err=%v", got, err)
	}
}
