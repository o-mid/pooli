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
  const label = title || "—";
  const looksLikeId = /^[0-9a-f]{6,}$/i.test(label);
  return (
    <Link href={href} className="list-row">
      <div className="list-row-body">
        <div className={looksLikeId ? "list-row-title mono-ltr" : "list-row-title"}>{label}</div>
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
