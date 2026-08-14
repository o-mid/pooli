import type { ReactNode } from "react";
import { TelegramWebAppReady } from "@/components/TelegramWebAppReady";

export default function TelegramLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TelegramWebAppReady />
      {children}
    </>
  );
}
