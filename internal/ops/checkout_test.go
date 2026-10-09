package ops

import "testing"

func TestEffectiveCheckoutNetworks(t *testing.T) {
	fresh := func(net string) CursorStatus {
		return CursorStatus{Network: net, OK: true, HasCursor: true}
	}
	stale := func(net string) CursorStatus {
		return CursorStatus{Network: net, OK: false, HasCursor: true}
	}

	got := EffectiveCheckoutNetworks([]string{"tron", "bsc"}, []CursorStatus{fresh("tron"), fresh("bsc")}, nil)
	if len(got) != 2 {
		t.Fatalf("both fresh: %#v", got)
	}

	got = EffectiveCheckoutNetworks([]string{"tron"}, []CursorStatus{fresh("tron"), fresh("bsc")}, nil)
	if len(got) != 1 || got[0] != "tron" {
		t.Fatalf("flag off hides bsc: %#v", got)
	}

	got = EffectiveCheckoutNetworks([]string{"tron", "bsc"}, []CursorStatus{fresh("tron"), stale("bsc")}, nil)
	if len(got) != 1 || got[0] != "tron" {
		t.Fatalf("stale bsc: %#v", got)
	}

	got = EffectiveCheckoutNetworks([]string{"tron", "bsc"}, []CursorStatus{stale("tron"), fresh("bsc")}, nil)
	if len(got) != 1 || got[0] != "bsc" {
		t.Fatalf("stale tron: %#v", got)
	}

	got = EffectiveCheckoutNetworks([]string{"tron", "bsc"}, []CursorStatus{fresh("tron"), fresh("bsc")}, map[string]int{"bsc": 1})
	if len(got) != 1 || got[0] != "tron" {
		t.Fatalf("open gap hides bsc: %#v", got)
	}

	// Missing cursor is not stale.
	got = EffectiveCheckoutNetworks([]string{"tron", "bsc"}, []CursorStatus{fresh("tron")}, nil)
	if len(got) != 2 {
		t.Fatalf("missing bsc cursor: %#v", got)
	}
}
