import type { Metadata } from "next";
import { privateRouteRobots } from "@/lib/site-metadata";

export const metadata: Metadata = privateRouteRobots;

export default function LinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
