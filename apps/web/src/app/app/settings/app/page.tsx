"use client";

import { useEffect, useState } from "react";
import { requestInstallSheet } from "@/components/InstallSheet";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { useT } from "@/i18n/LocaleProvider";
import { isStandaloneDisplay } from "@/lib/pwa";

export default function AppLanguageSettingsPage() {
  const t = useT();
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
  }, []);

  return (
    <div className="rise page-stack">
      <BackLink href="/app/settings" />
      <PageHeader title={t.settings.appLanguage} subtitle={t.settings.appLanguageHint} />
      <div className="list-group">
        <div className="list-row" style={{ cursor: "default" }}>
          <div className="list-row-body">
            <div className="list-row-title">{t.settings.language}</div>
          </div>
          <div className="list-row-trailing">
            <LanguageSwitch />
          </div>
        </div>
        {!standalone ? (
          <button type="button" className="list-row" onClick={() => requestInstallSheet()}>
            <div className="list-row-body">
              <div className="list-row-title">{t.settings.addToHome}</div>
              <div className="list-row-meta">{t.install.subtitle}</div>
            </div>
          </button>
        ) : null}
      </div>
    </div>
  );
}
