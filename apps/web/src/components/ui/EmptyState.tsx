import type { ReactNode } from "react";

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state list-group">
      <div>{children}</div>
      {action}
    </div>
  );
}
