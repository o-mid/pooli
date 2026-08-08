import type { Metadata, Viewport } from "next";
import { LocaleProvider } from "@/i18n/LocaleProvider";
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
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pooli",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F8F6B",
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom (HIG / WCAG); do not lock maximumScale.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <LocaleProvider>
          <ServiceWorkerRegister />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
