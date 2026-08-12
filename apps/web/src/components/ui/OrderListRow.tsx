import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Messages } from "@/i18n/messages/en";

export function OrderListRow({
  href,
  title,
  amountToman,
  tomanLabel,
  status,
  t,
  meta,
}: {
  href: string;
  title: string;
  amountToman: number;
  tomanLabel: string;
  status: string;
  t: Messages;
  meta?: string;
}) {
  return (
    <Link href={href} className="list-row">
      <div className="list-row-body">
        <div className="list-row-title">{title || "—"}</div>
        <div className="list-row-meta tabular">
          {amountToman.toLocaleString()} {tomanLabel}
        </div>
        {meta ? <div className="list-row-meta">{meta}</div> : null}
      </div>
      <div className="list-row-trailing">
        <StatusBadge status={status} t={t} />
      </div>
    </Link>
  );
}
