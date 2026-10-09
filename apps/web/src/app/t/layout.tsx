import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TelegramWebAppReady } from "@/components/TelegramWebAppReady";
import { privateRouteRobots } from "@/lib/site-metadata";

export const metadata: Metadata = privateRouteRobots;

export default function TelegramLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TelegramWebAppReady />
      {children}
    </>
  );
}
