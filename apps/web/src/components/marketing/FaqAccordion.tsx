"use client";

import { StaggerItem, StaggerRoot } from "@/components/motion/Stagger";

type Item = { q: string; a: string };

export function FaqAccordion({ items }: { items: Item[] }) {
  return (
    <StaggerRoot className="faq-list">
      {items.map((item) => (
        <StaggerItem key={item.q}>
          <details className="faq-item">
            <summary className="faq-summary">{item.q}</summary>
            <p className="faq-answer">{item.a}</p>
          </details>
        </StaggerItem>
      ))}
    </StaggerRoot>
  );
}
