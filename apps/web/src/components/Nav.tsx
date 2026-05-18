"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/LocaleProvider";

export function Nav() {
  const path = usePathname();
  const t = useT();

  const items = [
    { href: "/app", label: t.nav.home },
    { href: "/app/orders", label: t.nav.orders },
    { href: "/app/create", label: t.nav.new },
    { href: "/app/wallets", label: t.nav.wallets },
    { href: "/app/settings", label: t.nav.settings },
  ];

  return (
    <nav className="nav" aria-label="Main">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={path === item.href ? "active" : ""}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
