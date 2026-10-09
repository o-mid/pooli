import { securityTxtExpires, siteConfig } from "@/lib/site";

export function GET() {
  const lines = [
    `Contact: mailto:${siteConfig.contact.support}`,
    `Contact: mailto:${siteConfig.contact.founder}`,
    `Expires: ${securityTxtExpires()}`,
    "Preferred-Languages: en, fa",
    `Canonical: ${siteConfig.url.replace(/\/$/, "")}/.well-known/security.txt`,
    `Policy: ${siteConfig.url.replace(/\/$/, "")}/security`,
  ];
  return new Response(`${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
