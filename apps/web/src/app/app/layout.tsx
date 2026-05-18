"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Nav } from "@/components/Nav";
import { useT } from "@/i18n/LocaleProvider";

export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <>
      <main className="shell app-shell">
        <header style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
          <LanguageSwitch />
        </header>
        {offline && <div className="offline-banner">{t.common.offline}</div>}
        {children}
      </main>
      <Nav />
    </>
  );
}
