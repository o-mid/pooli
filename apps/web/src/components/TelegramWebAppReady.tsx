"use client";

import { useEffect } from "react";

function bootTelegram() {
  const tw = window.Telegram?.WebApp;
  if (!tw) return;
  tw.ready();
  tw.expand();
  const bg = tw.themeParams?.bg_color;
  if (bg) document.documentElement.style.setProperty("--tg-theme-bg-color", bg);
}

export function TelegramWebAppReady() {
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      bootTelegram();
      return;
    }
    if (document.querySelector("script[data-telegram-web-app]")) return;
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    s.dataset.telegramWebApp = "1";
    s.onload = () => bootTelegram();
    document.head.appendChild(s);
  }, []);
  return null;
}
