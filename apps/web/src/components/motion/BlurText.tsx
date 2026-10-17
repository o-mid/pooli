"use client";

import { motion, useReducedMotion } from "motion/react";

/** Word-by-word blur reveal (Finwise / next-saas-lp inspired; RTL-safe). */
export function BlurText({ text, className = "" }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <span className={className}>{text}</span>;
  }

  const parts = text.split(/(\s+)/);

  return (
    <span className={className} aria-label={text}>
      {parts.map((part, i) =>
        /^\s+$/.test(part) ? (
          part
        ) : (
          <motion.span
            key={`${part}-${i}`}
            style={{ display: "inline-block", whiteSpace: "pre-wrap" }}
            initial={{ opacity: 0, filter: "blur(12px)", y: 12 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          >
            {part}
          </motion.span>
        ),
      )}
    </span>
  );
}
