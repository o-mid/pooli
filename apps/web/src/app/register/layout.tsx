import type { Metadata } from "next";
import { privateRouteRobots } from "@/lib/site-metadata";

export const metadata: Metadata = privateRouteRobots;

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
