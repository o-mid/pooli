"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ShineBorder } from "@/components/motion/ShineBorder";

export function LandingPrimaryCta({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className="lp-shine-host">
      <ShineBorder />
      <Link className={["btn btn-primary lp-btn-pill", className].filter(Boolean).join(" ")} href={href}>
        {children}
      </Link>
    </span>
  );
}
