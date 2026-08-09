import type { ReactNode } from "react";

function EmptyIcon() {
  return (
    <svg className="empty-state-icon" viewBox="0 0 48 48" aria-hidden>
      <rect x="8" y="12" width="32" height="28" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 20h16M16 26h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="34" cy="34" r="7" fill="var(--bg)" stroke="currentColor" strokeWidth="2" />
      <path d="M34 31v6M31 34h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({
  children,
  action,
  title,
}: {
  children: ReactNode;
  action?: ReactNode;
  title?: string;
}) {
  return (
    <div className="empty-state list-group">
      <EmptyIcon />
      {title ? <h3 className="empty-state-title">{title}</h3> : null}
      <div className="empty-state-body">{children}</div>
      {action}
    </div>
  );
}
