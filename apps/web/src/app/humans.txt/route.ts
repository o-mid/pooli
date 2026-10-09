import { siteBuildDate, siteConfig, withLegalStatus } from "@/lib/site";

export function GET() {
  const body = `/* TEAM */
Founder: ${siteConfig.founder.name}
Site: ${siteConfig.url}
Location: Athens, Greece

/* THANKS */
Open-source contributors and chain RPC providers.

/* SITE */
Last update: ${siteBuildDate()}
Legal: ${withLegalStatus("privacy and terms")}
Stack: Next.js, Go, PostgreSQL
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
