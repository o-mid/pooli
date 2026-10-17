"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Subtle hover lift for marketing cards (respects reduced motion). */
export function HoverLift({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.99 }}
    >
      {children}
    </motion.div>
  );
}
