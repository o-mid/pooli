import type { ReactNode } from "react";

export function Section({
  id,
  title,
  lead,
  children,
  className = "",
}: {
  id?: string;
  title?: string;
  lead?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`marketing-section ${className}`.trim()}>
      {title ? <h2 className="marketing-h2">{title}</h2> : null}
      {lead ? <p className="marketing-lead">{lead}</p> : null}
      {children}
    </section>
  );
}
