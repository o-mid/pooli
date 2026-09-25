/** Human confirmation channel (separate from Pooli commerce API). */

export type ProposalView = {
  id: string;
  state: string;
  orderId: string;
  orderSlug: string;
  body: string;
  locale: string;
  paymentStatus: string;
  payloadDigest: string;
  expiresAt: number;
  createdAt: number;
};

export type MessageDraftPayload = {
  orderId: string;
  orderSlug: string;
  body: string;
  locale: string;
  paymentStatus: string;
};

function trimBase(url: string): string {
  return url.replace(/\/$/, "");
}

/** Public gateway origin for opening /p/:proposalId (full URL). */
export function actionGatewayPublicBase(): string {
  return trimBase(process.env.NEXT_PUBLIC_ACTION_GATEWAY_URL || "");
}

/** Same-origin proxy path when NEXT_PUBLIC_ACTION_GATEWAY_URL is configured. */
export function actionGatewayApiBase(): string {
  if (!actionGatewayPublicBase()) return "";
  return "/action-gateway";
}

export function proposalConfirmPageUrl(proposalId: string): string {
  const base = actionGatewayPublicBase();
  if (!base) return "";
  return `${base}/p/${encodeURIComponent(proposalId)}`;
}

async function gatewayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = actionGatewayApiBase();
  if (!base) {
    throw new Error("action gateway not configured");
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data.message === "string"
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : `request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function fetchProposal(proposalId: string): Promise<ProposalView> {
  return gatewayFetch<ProposalView>(`/api/proposals/${encodeURIComponent(proposalId)}`);
}

export async function rejectProposal(proposalId: string): Promise<ProposalView> {
  return gatewayFetch<ProposalView>(`/api/proposals/${encodeURIComponent(proposalId)}/reject`, {
    method: "POST",
    body: "{}",
  });
}

export async function confirmProposal(
  proposalId: string,
  linkCode: string,
  payloadDigest: string,
): Promise<ProposalView & { simulated?: boolean }> {
  return gatewayFetch(`/api/proposals/${encodeURIComponent(proposalId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ linkCode: linkCode.trim().toUpperCase(), payloadDigest }),
  });
}

/** Matches action-gateway digestPayload (SHA-256 of canonical JSON array). */
export async function digestMessageDraftPayload(p: MessageDraftPayload): Promise<string> {
  const canonical = JSON.stringify([p.orderId, p.orderSlug, p.body, p.locale, p.paymentStatus]);
  const bytes = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
