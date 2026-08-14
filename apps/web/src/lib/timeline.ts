import type { Messages } from "@/i18n/messages/en";

const englishSystemTitle = /^(Order |Payment |Customer |Shipped|Underpaid|Overpaid|Needs review|Preparing|Delivered|Cancelled)/i;

export function timelineLabel(eventType: string, t: Messages, fallback?: string): string {
  const mapped = t.timeline.events[eventType as keyof typeof t.timeline.events];
  if (mapped) return mapped;
  const title = fallback?.trim();
  if (title && !englishSystemTitle.test(title)) return title;
  return eventType;
}
