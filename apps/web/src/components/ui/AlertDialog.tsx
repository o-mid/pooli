"use client";

import { type ReactNode, useEffect } from "react";

export function AlertDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-root" role="alertdialog" aria-modal="true" aria-labelledby="alert-dialog-title">
      <button type="button" className="install-sheet-backdrop" aria-hidden onClick={onCancel} />
      <div className="dialog-panel">
        <h2 id="alert-dialog-title" className="dialog-title">
          {title}
        </h2>
        {body ? <div className="dialog-body">{body}</div> : null}
        <div className="cta-stack dialog-actions">
          <button type="button" className={destructive ? "btn btn-destructive" : "btn btn-primary"} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
