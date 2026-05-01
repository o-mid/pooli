package sse

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type Event struct {
	Type    string         `json:"type"`
	Payload map[string]any `json:"payload"`
}

type Hub struct {
	mu   sync.RWMutex
	subs map[string]map[chan Event]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: map[string]map[chan Event]struct{}{}}
}

func (h *Hub) Subscribe(key string) chan Event {
	ch := make(chan Event, 16)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[key] == nil {
		h.subs[key] = map[chan Event]struct{}{}
	}
	h.subs[key][ch] = struct{}{}
	return ch
}

func (h *Hub) Unsubscribe(key string, ch chan Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m, ok := h.subs[key]; ok {
		delete(m, ch)
		close(ch)
		if len(m) == 0 {
			delete(h.subs, key)
		}
	}
}

func (h *Hub) Publish(key string, ev Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subs[key] {
		select {
		case ch <- ev:
		default:
		}
	}
}

func (h *Hub) PublishIntent(intentID string, ev Event) {
	h.Publish("intent:"+intentID, ev)
}

func (h *Hub) PublishMerchant(merchantID string, ev Event) {
	h.Publish("merchant:"+merchantID, ev)
}

func WriteStream(w http.ResponseWriter, r *http.Request, ch <-chan Event) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "sse unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			b, _ := json.Marshal(ev)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, string(b))
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}
