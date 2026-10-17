"use client";

import { SlideIn } from "@/components/motion/SlideIn";

type Item = { q: string; a: string };

export function FaqAccordion({ items }: { items: Item[] }) {
  return (
    <div className="faq-list">
      {items.map((item, i) => (
        <SlideIn key={item.q} delay={i * 0.04}>
          <details className="faq-item">
            <summary className="faq-summary">{item.q}</summary>
            <div className="faq-answer-wrap">
              <p className="faq-answer">{item.a}</p>
            </div>
          </details>
        </SlideIn>
      ))}
    </div>
  );
}
