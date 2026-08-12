import type { Messages } from "@/i18n/messages/en";

export function timelineLabel(eventType: string, t: Messages, fallback?: string): string {
  const mapped = t.timeline.events[eventType as keyof typeof t.timeline.events];
  if (mapped) return mapped;
  const title = fallback?.trim();
  return title || eventType;
}
