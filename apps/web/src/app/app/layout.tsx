"use client";

import { useEffect, useState, type ReactNode } from "react";
import { InstallSheet } from "@/components/InstallSheet";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { MerchantChrome } from "@/components/MerchantChrome";
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
        <div className="app-topbar">
          <MerchantChrome />
          <LanguageSwitch />
        </div>
        {offline && (
          <div className="offline-banner" role="status">
            {t.common.offline}
          </div>
        )}
        <div className="page-stack">{children}</div>
      </main>
      <Nav />
      <InstallSheet />
    </>
  );
}
