"use client";

import Link from "next/link";
import { useT } from "@/i18n/LocaleProvider";

export function BackLink({ href, label }: { href: string; label?: string }) {
  const t = useT();
  return (
    <Link href={href} className="back-link">
      <span className="back-chevron" aria-hidden>
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path
            d="M15 6 9 12l6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {label || t.common.back}
    </Link>
  );
}
