import { orderStatusLabel } from "@/lib/orderStatus";
import type { Messages } from "@/i18n/messages/en";

export function StatusBadge({ status, t }: { status: string; t: Messages }) {
  const tone = status.toLowerCase();
  return <span className={`status-badge ${tone}`}>{orderStatusLabel(status, t)}</span>;
}
