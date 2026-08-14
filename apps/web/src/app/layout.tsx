import type { Metadata, Viewport } from "next";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { InstallPromptCapture } from "@/components/InstallSheet";
import { ToastProvider } from "@/components/ui/Toast";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pooli",
  description: "Turn a DM order into a checkout link. Get paid in USDT.",
  applicationName: "Pooli",
  manifest: "/manifest.webmanifest",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://pooli.shop"),
  openGraph: {
    title: "Pooli",
    description: "Turn a DM order into a checkout link. Get paid in USDT.",
    type: "website",
    images: [{ url: "/brand/og-default.png", width: 1200, height: 630, alt: "Pooli" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pooli",
    description: "Turn a DM order into a checkout link. Get paid in USDT.",
    images: ["/brand/og-default.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pooli",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F8F6B" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1512" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const localeBoot = `
(function(){
  try {
    var loc = "";
    try { loc = localStorage.getItem("pooli_locale") || ""; } catch (e) {}
    if (loc !== "en" && loc !== "fa") {
      var m = document.cookie.match(/(?:^|; )pooli_locale=([^;]*)/);
      loc = m ? decodeURIComponent(m[1]) : "";
    }
    if (loc !== "en" && loc !== "fa") {
      var nav = (navigator.language || "").toLowerCase();
      loc = (nav.indexOf("fa") === 0 || nav.indexOf("per") === 0) ? "fa" : "en";
    }
    document.documentElement.lang = loc;
    document.documentElement.dir = loc === "fa" ? "rtl" : "ltr";
    document.documentElement.dataset.locale = loc;
    var theme = "";
    try { theme = localStorage.getItem("pooli_theme") || ""; } catch (e) {}
    if (theme !== "light" && theme !== "dark" && theme !== "system") {
      var tm = document.cookie.match(/(?:^|; )pooli_theme=([^;]*)/);
      theme = tm ? decodeURIComponent(tm[1]) : "system";
    }
    var resolved = theme;
    if (theme !== "light" && theme !== "dark") {
      resolved = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    }
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeBoot }} />
      </head>
      <body>
        <LocaleProvider>
          <ThemeProvider>
            <ToastProvider>
              <ServiceWorkerRegister />
              <InstallPromptCapture />
              {children}
            </ToastProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
