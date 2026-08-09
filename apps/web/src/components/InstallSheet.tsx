"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import {
  type BeforeInstallPromptEvent,
  detectInstallPlatform,
  dismissInstallPrompt,
  isStandaloneDisplay,
  wasInstallDismissed,
} from "@/lib/pwa";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let bipListenersReady = false;

function ensureBipCapture() {
  if (typeof window === "undefined" || bipListenersReady) return;
  bipListenersReady = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("pooli-bip"));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    dismissInstallPrompt();
    window.dispatchEvent(new Event("pooli-installed"));
  });
}

export function requestInstallSheet() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("pooli-show-install"));
}

export function InstallSheet() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState(detectInstallPlatform);
  const [canNativeInstall, setCanNativeInstall] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    ensureBipCapture();
    setPlatform(detectInstallPlatform());

    const syncBip = () => setCanNativeInstall(Boolean(deferredPrompt));
    syncBip();

    const onShow = () => {
      if (isStandaloneDisplay()) return;
      setOpen(true);
    };
    const onInstalled = () => setOpen(false);

    window.addEventListener("pooli-bip", syncBip);
    window.addEventListener("pooli-show-install", onShow);
    window.addEventListener("pooli-installed", onInstalled);

    let timer: number | undefined;
    if (!isStandaloneDisplay() && !wasInstallDismissed()) {
      timer = window.setTimeout(() => {
        if (!isStandaloneDisplay() && !wasInstallDismissed()) setOpen(true);
      }, 900);
    }

    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("pooli-bip", syncBip);
      window.removeEventListener("pooli-show-install", onShow);
      window.removeEventListener("pooli-installed", onInstalled);
    };
  }, []);

  if (!open) return null;

  async function onInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      setCanNativeInstall(false);
      dismissInstallPrompt();
      setOpen(false);
    } catch {
      /* user dismissed native prompt */
    } finally {
      setInstalling(false);
    }
  }

  function onDismiss() {
    dismissInstallPrompt();
    setOpen(false);
  }

  return (
    <div className="install-sheet-root" role="dialog" aria-modal="true" aria-labelledby="install-sheet-title">
      <button type="button" className="install-sheet-backdrop" aria-label={t.install.notNow} onClick={onDismiss} />
      <div className="install-sheet">
        <div className="install-sheet-handle" aria-hidden />
        <h2 id="install-sheet-title" className="install-sheet-title">
          {t.install.title}
        </h2>
        <p className="install-sheet-sub">{t.install.subtitle}</p>

        {platform === "ios" && (
          <ol className="install-steps">
            <li>
              <span className="install-step-num">1</span>
              <span>
                {t.install.iosStep1} <ShareIcon />
              </span>
            </li>
            <li>
              <span className="install-step-num">2</span>
              <span>{t.install.iosStep2}</span>
            </li>
            <li>
              <span className="install-step-num">3</span>
              <span>{t.install.iosStep3}</span>
            </li>
          </ol>
        )}

        {platform === "android" && <p className="install-sheet-hint">{t.install.androidHint}</p>}

        {(platform === "desktop" || platform === "other") && (
          <p className="install-sheet-hint">{t.install.desktopHint}</p>
        )}

        <div className="cta-stack" style={{ marginTop: "var(--space-4)" }}>
          {canNativeInstall ? (
            <button type="button" className="btn btn-primary" disabled={installing} onClick={onInstall}>
              {installing ? t.common.loading : t.install.install}
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onDismiss}>
            {t.install.notNow}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg className="install-share-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M12 3v12M8 7l4-4 4 4M6 13v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Capture BIP as early as possible from root layout. */
export function InstallPromptCapture() {
  useEffect(() => {
    ensureBipCapture();
  }, []);
  return null;
}
