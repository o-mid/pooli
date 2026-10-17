"use client";

import { motion, useReducedMotion } from "motion/react";

/** Magic UI border-beam — traveling highlight on card edges (motion offset-path). */
export function BorderBeam({
  size = 72,
  duration = 5.5,
  className = "",
}: {
  size?: number;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div className={["lp-border-beam-mask", className].filter(Boolean).join(" ")} aria-hidden="true">
      <motion.div
        className="lp-border-beam-orb"
        style={{
          width: size,
          offsetPath: "rect(0 auto auto 0 round var(--radius-lg))",
        }}
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: "100%" }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}
