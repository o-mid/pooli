"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";

type Me = {
  user?: { is_admin?: boolean; IsAdmin?: boolean };
};

export default function SettingsPage() {
  const t = useT();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    api<Me>("/api/v1/me")
      .then((d) => setIsAdmin(Boolean(d.user?.is_admin || d.user?.IsAdmin)))
      .catch(() => undefined);
  }, []);

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const groups = [
    { href: "/app/settings/store", title: t.settings.store, hint: t.settings.storeHint },
    { href: "/app/settings/getting-paid", title: t.settings.gettingPaid, hint: t.settings.gettingPaidHint },
    { href: "/app/settings/notifications", title: t.settings.notifications, hint: t.settings.notificationsHint },
    { href: "/app/settings/app", title: t.settings.appLanguage, hint: t.settings.appLanguageHint },
  ];

  return (
    <div className="rise page-stack">
      <PageHeader title={t.settings.title} />
      <div className="list-group">
        {groups.map((g) => (
          <Link key={g.href} href={g.href} className="list-row">
            <div className="list-row-body">
              <div className="list-row-title">{g.title}</div>
              <div className="list-row-meta">{g.hint}</div>
            </div>
          </Link>
        ))}
      </div>

      <section className="section">
        <h2 className="section-title">{t.settings.account}</h2>
        <div className="list-group">
          {isAdmin ? (
            <a className="list-row" href="/admin">
              <div className="list-row-body">
                <div className="list-row-title">{t.admin.title}</div>
              </div>
            </a>
          ) : null}
          <button type="button" className="list-row" onClick={() => setConfirmLogout(true)}>
            <div className="list-row-body">
              <div className="list-row-title">{t.logout}</div>
            </div>
          </button>
        </div>
      </section>
      <section className="section">
        <h2 className="section-title">{t.settings.about}</h2>
        <div className="list-group">
          <div className="list-row" style={{ cursor: "default" }}>
            <div className="list-row-body">
              <div className="list-row-title">{t.settings.version}</div>
            </div>
            <div className="list-row-trailing tabular">0.1.0</div>
          </div>
        </div>
      </section>
      <AlertDialog
        open={confirmLogout}
        title={t.settings.logoutConfirm}
        confirmLabel={t.logout}
        cancelLabel={t.common.cancel}
        destructive
        onConfirm={() => {
          setConfirmLogout(false);
          void logout();
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
