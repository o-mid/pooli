package agent

// SnapshotSchemaVersion is bumped when agent-visible fields change shape.
const SnapshotSchemaVersion = "2026-10-11"

// AllowedTimelineEventTypes limits narrative events exposed to agents.
var AllowedTimelineEventTypes = map[string]bool{
	"order.created":              true,
	"customer.details_submitted": true,
	"payment.status_changed":     true,
	"quote refreshed":            true,
}
