package email

import (
	"context"
	"sync"
)

// Fake records sends for local/CI tests. Never use in production.
type Fake struct {
	mu      sync.Mutex
	Sent    []Message
	FailErr error
	Results []Result
}

func (f *Fake) Name() string { return "fake" }

func (f *Fake) Send(ctx context.Context, message Message) (Result, error) {
	if err := ctx.Err(); err != nil {
		return Result{}, &SendError{Category: CategoryTransient, Message: "canceled"}
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.FailErr != nil {
		return Result{}, f.FailErr
	}
	f.Sent = append(f.Sent, message)
	id := "fake-" + message.EventKey
	if len(f.Results) > 0 {
		r := f.Results[0]
		f.Results = f.Results[1:]
		if r.ProviderMessageID != "" {
			id = r.ProviderMessageID
		}
	}
	return Result{ProviderMessageID: id}, nil
}

func (f *Fake) Count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.Sent)
}

func (f *Fake) Reset() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Sent = nil
	f.FailErr = nil
	f.Results = nil
}
