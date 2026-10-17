"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type Direction = "top" | "bottom" | "left" | "right";

export function SlideIn({
  children,
  direction = "top",
  delay = 0,
  duration = 0.7,
  spring = true,
  className = "",
}: {
  children: ReactNode;
  direction?: Direction;
  delay?: number;
  duration?: number;
  /** next-saas-lp style spring vs eased slide */
  spring?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const y = direction === "top" ? 56 : direction === "bottom" ? -56 : 0;
  const x = direction === "left" ? 56 : direction === "right" ? -56 : 0;

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={
        spring
          ? { type: "spring", bounce: 0.2, duration: 0.9, delay }
          : { duration, delay, ease: [1, 0, 0, 1] }
      }
    >
      {children}
    </motion.div>
  );
}
