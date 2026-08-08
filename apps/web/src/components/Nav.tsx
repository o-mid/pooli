"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/LocaleProvider";

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
    </svg>
  );
}
function IconOrders() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconNew() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconWallets() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
    </svg>
  );
}

export function Nav() {
  const path = usePathname();
  const t = useT();

  const items = [
    { href: "/app", label: t.nav.home, Icon: IconHome, match: (p: string) => p === "/app" },
    {
      href: "/app/orders",
      label: t.nav.orders,
      Icon: IconOrders,
      match: (p: string) => p.startsWith("/app/orders"),
    },
    { href: "/app/create", label: t.nav.new, Icon: IconNew, match: (p: string) => p === "/app/create" },
    {
      href: "/app/wallets",
      label: t.nav.wallets,
      Icon: IconWallets,
      match: (p: string) => p === "/app/wallets",
    },
    {
      href: "/app/settings",
      label: t.nav.settings,
      Icon: IconSettings,
      match: (p: string) => p === "/app/settings",
    },
  ];

  return (
    <nav className="nav" aria-label={t.nav.home === "Home" ? "Main" : "منو"}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={item.match(path) ? "active" : ""}>
          <item.Icon />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
