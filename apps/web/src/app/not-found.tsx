"use client";

import Link from "next/link";
import { useT } from "@/i18n/LocaleProvider";

export default function NotFoundPage() {
  const t = useT();
  return (
    <main className="shell page-stack">
      <h1 className="page-title">{t.checkout.notFound}</h1>
      <Link className="btn btn-primary" href="/">
        {t.brand}
      </Link>
    </main>
  );
}
