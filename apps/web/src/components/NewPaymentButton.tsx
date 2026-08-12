"use client";

import Link from "next/link";
import { useT } from "@/i18n/LocaleProvider";

export function NewPaymentButton({
  className = "btn btn-primary",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const t = useT();
  if (compact) {
    return (
      <Link className="header-plus" href="/app/create" aria-label={t.home.newOrder}>
        +
      </Link>
    );
  }
  return (
    <Link className={className} href="/app/create">
      {t.home.newOrder}
    </Link>
  );
}
