"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastCtx = { showToast: (message: string) => void };

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);

  const showToast = useCallback((next: string) => {
    setMessage(next);
    setVisible(true);
    window.setTimeout(() => setVisible(false), 1800);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className={`toast${visible ? " toast-visible" : ""}`} role="status" aria-live="polite">
        {message}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      showToast: (message: string) => {
        /* fallback when provider missing */
        if (typeof window !== "undefined") window.alert(message);
      },
    };
  }
  return ctx;
}
