package instagram

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pooli-shop/pooli/internal/config"
)

func TestSendTextUsesRecipientAndBearer(t *testing.T) {
	var gotAuth, gotPath string
	var body map[string]any
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_ = json.NewEncoder(w).Encode(map[string]any{"recipient_id": "1", "message_id": "m"})
	}))
	defer ts.Close()

	c := NewClient(config.Config{
		InstagramAccessToken:  "tok-secret",
		InstagramIGUserID:     "ig-bot",
		InstagramGraphBase:    "https://graph.instagram.com",
		InstagramGraphVersion: "v21.0",
	})
	c.BaseURL = ts.URL
	if err := c.SendText(context.Background(), "seller-igsid", "hello"); err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer tok-secret" {
		t.Fatalf("auth %q", gotAuth)
	}
	if gotPath != "/messages" {
		t.Fatalf("path %q", gotPath)
	}
	recip, _ := body["recipient"].(map[string]any)
	if recip["id"] != "seller-igsid" {
		t.Fatalf("recipient %#v", recip)
	}
	msg, _ := body["message"].(map[string]any)
	if msg["text"] != "hello" {
		t.Fatalf("message %#v", msg)
	}
}

func TestSendTextEmptyRecipientNoRequest(t *testing.T) {
	called := false
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	defer ts.Close()
	c := &Client{Token: "tok", BaseURL: ts.URL}
	if err := c.SendText(context.Background(), "", "x"); err != nil {
		t.Fatal(err)
	}
	if called {
		t.Fatal("must not call Graph without recipient")
	}
}

func TestSetIceBreakers(t *testing.T) {
	var body map[string]any
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"result":"success"}`))
	}))
	defer ts.Close()
	c := &Client{Token: "tok", BaseURL: ts.URL}
	err := c.SetIceBreakers(context.Background(), []IceBreaker{
		{Question: "پرداخت", Payload: "PAY"},
		{Question: "Pay", Payload: "PAY"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if body["platform"] != "instagram" {
		t.Fatalf("platform %#v", body["platform"])
	}
}
