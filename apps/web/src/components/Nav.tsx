"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Icons8Icon, type Icons8Name } from "@/components/icons/Icons8Icon";
import { useT } from "@/i18n/LocaleProvider";

export function Nav() {
  const path = usePathname();
  const t = useT();
  const reduce = useReducedMotion();

  if (path.startsWith("/app/onboarding")) return null;

  const items: Array<{
    href: string;
    label: string;
    icon: Icons8Name;
    match: (p: string) => boolean;
  }> = [
    { href: "/app", label: t.nav.home, icon: "home", match: (p) => p === "/app" },
    {
      href: "/app/orders",
      label: t.nav.orders,
      icon: "orders",
      match: (p) => p.startsWith("/app/orders"),
    },
    {
      href: "/app/customers",
      label: t.nav.customers,
      icon: "customers",
      match: (p) => p.startsWith("/app/customers"),
    },
    {
      href: "/app/settings",
      label: t.nav.settings,
      icon: "settings",
      match: (p) =>
        p.startsWith("/app/settings") || p === "/app/wallets" || p.startsWith("/app/links"),
    },
  ];

  return (
    <nav className="nav nav-ai" aria-label={t.common.mainNav}>
      {items.map((item) => {
        const active = item.match(path);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
          >
            {active && !reduce ? (
              <motion.span
                className="nav-icon-wrap"
                layoutId="nav-active-icon"
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
              >
                <Icons8Icon name={item.icon} size="md" />
              </motion.span>
            ) : (
              <span className="nav-icon-wrap">
                <Icons8Icon name={item.icon} size="md" />
              </span>
            )}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
