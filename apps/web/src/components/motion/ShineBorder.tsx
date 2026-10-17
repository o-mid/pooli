"use client";

/** Magic UI shine-border — animated edge highlight (CSS-driven). */
export function ShineBorder({ className = "" }: { className?: string }) {
  return <span className={["shine-border", className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
