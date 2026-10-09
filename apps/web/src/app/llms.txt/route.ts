import { companyAddressLine, siteConfig } from "@/lib/site";

export function GET() {
  const base = siteConfig.url.replace(/\/$/, "");
  const body = `# Pooli

Pooli is a non-custodial USDT checkout for sellers who close sales in DMs. Sellers quote in toman and share a payment link; buyers pay exact USDT to the seller's wallet; Pooli marks Paid only after server-side blockchain verification. Pooli is not a custodian, exchange, or wallet; it does not use AI agents for follow-ups.

## Key pages
- ${base}/ — Product overview and how it works
- ${base}/about — Company imprint and founder
- ${base}/contact — support@pooli.shop and contact details
- ${base}/faq — Networks, custody, buyers, wrong amounts
- ${base}/security — Security design facts and disclosure
- ${base}/privacy — Privacy policy (draft)
- ${base}/terms — Terms of service (draft)

## Organization
Legal name: ${siteConfig.company.legalNameEn}
Address: ${companyAddressLine("en")}
Support: ${siteConfig.contact.support}
Founder: ${siteConfig.founder.name} (${siteConfig.contact.founder})
Founded: ${siteConfig.foundingYear ?? "2024"} (Athens, Greece). Friends-and-family pre-seed; no public GMV claims.

## What Pooli is not
Not custodial, not an exchange, no card acquiring, no invented traction claims, no AI product features.
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
