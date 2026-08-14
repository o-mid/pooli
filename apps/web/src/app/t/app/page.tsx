"use client";

import Link from "next/link";
import { useT } from "@/i18n/LocaleProvider";

export default function TelegramHomeLite() {
  const t = useT();
  return (
    <main className="shell rise page-stack">
      <h1 className="page-title">{t.miniapp.title}</h1>
      <p className="muted">{t.miniapp.connectHint}</p>
      <div className="cta-stack">
        <Link className="btn btn-primary" href="/t/app/create">
          {t.miniapp.create}
        </Link>
        <a className="btn btn-secondary" href="https://pooli.shop/app/settings/notifications">
          {t.miniapp.openPooli}
        </a>
      </div>
    </main>
  );
}
