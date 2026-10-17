"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

/** Magic UI border-beam — one pass when scrolled into view (loops once). */
export function BorderBeam({
  size = 72,
  duration = 2.8,
  className = "",
}: {
  size?: number;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [done, setDone] = useState(false);
  if (reduce || done) return null;

  return (
    <div className={["lp-border-beam-mask", className].filter(Boolean).join(" ")} aria-hidden="true">
      <motion.div
        className="lp-border-beam-orb"
        style={{
          width: size,
          offsetPath: "rect(0 auto auto 0 round var(--radius-lg))",
        }}
        initial={{ offsetDistance: "0%", opacity: 0 }}
        whileInView={{ offsetDistance: "100%", opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration, ease: "linear" }}
        onAnimationComplete={() => setDone(true)}
      />
    </div>
  );
}
