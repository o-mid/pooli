"use client";

import { motion, useReducedMotion } from "motion/react";

/** next-saas-lp text reveal — per-word whileInView (RTL-safe). */
export function TextReveal({ text, className = "" }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <span className={className}>{text}</span>;
  }

  const parts = text.split(/(\s+)/);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        /^\s+$/.test(part) ? (
          part
        ) : (
          <motion.span
            key={`${part}-${i}`}
            style={{ display: "inline-block" }}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: i * 0.04, duration: 0.65, ease: [1, 0, 0, 1] }}
          >
            {part}
          </motion.span>
        ),
      )}
    </span>
  );
}
