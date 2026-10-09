import type { ReactNode } from "react";
import type { Metadata } from "next";
import { privateRouteRobots } from "@/lib/site-metadata";
import AppLayoutClient from "./AppLayoutClient";

export const metadata: Metadata = privateRouteRobots;

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppLayoutClient>{children}</AppLayoutClient>;
}
