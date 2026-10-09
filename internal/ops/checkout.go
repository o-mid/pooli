package ops

// EffectiveCheckoutNetworks is the buyer-facing network list.
// A configured network is withheld when its cursor is present and stale,
// or when an unacknowledged watcher gap exists for it.
// A missing cursor is not treated as stale (the watcher may not have polled yet).
func EffectiveCheckoutNetworks(configured []string, cursors []CursorStatus, unacked map[string]int) []string {
	byNet := map[string]CursorStatus{}
	for _, c := range cursors {
		byNet[c.Network] = c
	}
	out := make([]string, 0, len(configured))
	for _, n := range configured {
		if unacked[n] > 0 {
			continue
		}
		if c, ok := byNet[n]; ok && c.HasCursor && !c.OK {
			continue
		}
		out = append(out, n)
	}
	return out
}

// MarkCursorsUnhealthyForGaps forces ok=false when a network has an open gap,
// even if the cursor timestamp is fresh.
func MarkCursorsUnhealthyForGaps(cursors []CursorStatus, unacked map[string]int) []CursorStatus {
	if len(unacked) == 0 {
		return cursors
	}
	out := make([]CursorStatus, len(cursors))
	copy(out, cursors)
	for i := range out {
		if unacked[out[i].Network] > 0 {
			out[i].OK = false
		}
	}
	return out
}
