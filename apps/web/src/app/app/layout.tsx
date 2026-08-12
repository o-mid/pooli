"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { InstallSheet } from "@/components/InstallSheet";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { MerchantChrome } from "@/components/MerchantChrome";
import { Nav } from "@/components/Nav";
import { NewPaymentButton } from "@/components/NewPaymentButton";
import { useT } from "@/i18n/LocaleProvider";

export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const navPath = usePathname();
  const [offline, setOffline] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const path = navPath || "";
  const showChromeCreate =
    mounted &&
    Boolean(path) &&
    path !== "/app" &&
    path !== "/app/" &&
    !path.startsWith("/app/create") &&
    !/^\/app\/orders\/[^/]+/.test(path);

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
          <div className="app-topbar-actions">
            {showChromeCreate ? (
              <NewPaymentButton className="btn btn-primary btn-new-payment desktop-only" />
            ) : null}
            <LanguageSwitch />
          </div>
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
