"use client";

type Item = { q: string; a: string };

export function FaqAccordion({ items }: { items: Item[] }) {
  return (
    <div className="faq-list">
      {items.map((item) => (
        <details key={item.q} className="faq-item">
          <summary className="faq-summary">{item.q}</summary>
          <p className="faq-answer">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
