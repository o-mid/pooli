import { api } from "@/lib/api";
import { fetchProposal, type ProposalView } from "@/lib/action-gateway";

type OrderProposalRef = { id: string; state?: string };

type OrderProposalsResponse = {
  proposals?: OrderProposalRef[];
  pending_proposals?: OrderProposalRef[];
};

export async function listOrderProposalRefs(orderId: string): Promise<OrderProposalRef[]> {
  try {
    const data = await api<OrderProposalsResponse>(`/api/v1/orders/${encodeURIComponent(orderId)}/proposals`);
    const merged = [...(data.proposals ?? []), ...(data.pending_proposals ?? [])];
    const byId = new Map<string, OrderProposalRef>();
    for (const p of merged) {
      if (p?.id) byId.set(p.id, p);
    }
    return [...byId.values()];
  } catch {
    return [];
  }
}

export async function loadPendingProposalsForOrder(
  orderId: string,
  extraIds: string[] = [],
): Promise<ProposalView[]> {
  const refs = await listOrderProposalRefs(orderId);
  const ids = new Set<string>(extraIds.filter(Boolean));
  for (const r of refs) {
    if (r.id) ids.add(r.id);
  }
  if (ids.size === 0) return [];

  const views = await Promise.all(
    [...ids].map(async (id) => {
      try {
        return await fetchProposal(id);
      } catch {
        return null;
      }
    }),
  );

  return views.filter(
    (p): p is ProposalView =>
      p != null && p.orderId === orderId && p.state === "pending_confirmation",
  );
}
