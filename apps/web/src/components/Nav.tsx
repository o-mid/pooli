"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app", label: "Home" },
  { href: "/app/orders", label: "Orders" },
  { href: "/app/create", label: "Create" },
  { href: "/app/wallets", label: "Wallets" },
  { href: "/app/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={path === item.href ? "active" : ""}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
