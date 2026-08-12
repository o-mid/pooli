"use client";

import Link from "next/link";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { useT } from "@/i18n/LocaleProvider";

export default function GettingPaidPage() {
  const t = useT();
  const items = [
    { href: "/app/wallets", title: t.wallets.title, hint: t.settings.walletsRowHint },
    { href: "/app/links", title: t.links.title, hint: t.links.hint },
    { href: "/app/settings/getting-paid/questions", title: t.settings.buyerQuestions, hint: t.settings.buyerQuestionsHint },
  ];

  return (
    <div className="rise page-stack">
      <BackLink href="/app/settings" />
      <PageHeader title={t.settings.gettingPaid} subtitle={t.settings.gettingPaidHint} />
      <div className="list-group">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="list-row">
            <div className="list-row-body">
              <div className="list-row-title">{item.title}</div>
              <div className="list-row-meta">{item.hint}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
