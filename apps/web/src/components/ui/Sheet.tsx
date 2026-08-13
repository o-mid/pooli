"use client";

import { type ReactNode, useEffect } from "react";

export function Sheet({
  open,
  onClose,
  title,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  labelledBy?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="install-sheet-root" role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={!labelledBy ? title : undefined}>
      <button type="button" className="install-sheet-backdrop" aria-label="Close" onClick={onClose} />
      <div className="install-sheet">
        <div className="install-sheet-handle" aria-hidden />
        {title ? (
          <h2 id={labelledBy} className="install-sheet-title">
            {title}
          </h2>
        ) : null}
        {children}
      </div>
    </div>
  );
}
