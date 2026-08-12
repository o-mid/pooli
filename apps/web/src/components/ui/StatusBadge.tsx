import { orderStatusLabel } from "@/lib/orderStatus";
import type { Messages } from "@/i18n/messages/en";

export function StatusBadge({ status, t }: { status: string; t: Messages }) {
  const tone = status.toLowerCase();
  const paid = status === "PAID";
  return (
    <span className={`status-plain ${tone}`}>
      {paid ? t.orders.paidCheck : orderStatusLabel(status, t)}
    </span>
  );
}
