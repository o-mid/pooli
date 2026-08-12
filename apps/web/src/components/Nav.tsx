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
function IconCustomers() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.8-3.2 2.9-4.8 5.5-4.8S13.7 15.8 14.5 19" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.2 19c.4-1.8 1.6-3.1 3.3-3.1 1.2 0 2.2.6 2.8 1.6" />
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

  if (path.startsWith("/app/onboarding")) return null;

  const items = [
    { href: "/app", label: t.nav.home, Icon: IconHome, match: (p: string) => p === "/app" },
    {
      href: "/app/orders",
      label: t.nav.orders,
      Icon: IconOrders,
      match: (p: string) => p.startsWith("/app/orders"),
    },
    {
      href: "/app/customers",
      label: t.nav.customers,
      Icon: IconCustomers,
      match: (p: string) => p.startsWith("/app/customers"),
    },
    {
      href: "/app/settings",
      label: t.nav.settings,
      Icon: IconSettings,
      match: (p: string) =>
        p.startsWith("/app/settings") || p === "/app/wallets" || p.startsWith("/app/links"),
    },
  ];

  return (
    <nav className="nav" aria-label={t.common.mainNav}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={item.match(path) ? "active" : ""}>
          <item.Icon />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
