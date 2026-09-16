/**
 * Order snapshot for agent grounding (fixture for local e2e; production calls Pooli API).
 */

export interface OrderSnapshot {
  readonly schemaVersion: 1;
  readonly order: { readonly id: string; readonly title: string; readonly slug: string };
  readonly payment: { readonly status: string; readonly expiresAt: string | null };
  readonly amountUsdt: { readonly display: string; readonly baseUnits: number };
}

const FIXTURE: OrderSnapshot = {
  schemaVersion: 1,
  order: { id: 'ord_e2e_fixture', title: 'Ceramic mug set', slug: 'ceramic-mug-e2e' },
  payment: { status: 'AWAITING_PAYMENT', expiresAt: '2030-01-01T00:00:00Z' },
  amountUsdt: { display: '12.50', baseUnits: 12_500_000 },
};

function pooliApiBase(): string | null {
  const raw = process.env.POOLI_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

function isOrderSnapshot(value: unknown): value is OrderSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1) return false;
  const order = v.order as Record<string, unknown> | undefined;
  const payment = v.payment as Record<string, unknown> | undefined;
  const amount = v.amountUsdt as Record<string, unknown> | undefined;
  return (
    typeof order?.id === 'string' &&
    typeof order?.title === 'string' &&
    typeof order?.slug === 'string' &&
    typeof payment?.status === 'string' &&
    (payment.expiresAt === null || typeof payment.expiresAt === 'string') &&
    typeof amount?.display === 'string' &&
    typeof amount?.baseUnits === 'number'
  );
}

async function fetchSnapshotFromApi(orderId: string): Promise<OrderSnapshot | null> {
  const base = pooliApiBase();
  if (!base) return null;

  const url = `${base}/api/v1/agent/orders/${encodeURIComponent(orderId)}/snapshot`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = process.env.POOLI_AGENT_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    return null;
  }

  if (res.status === 404) return null;
  if (!res.ok) return null;

  try {
    const body: unknown = await res.json();
    return isOrderSnapshot(body) ? body : null;
  } catch {
    return null;
  }
}

export async function fetchOrderSnapshot(orderId: string): Promise<OrderSnapshot | null> {
  const id = orderId.trim();
  if (!id) return null;

  const fromApi = await fetchSnapshotFromApi(id);
  if (fromApi) return fromApi;

  if (!pooliApiBase() && id === FIXTURE.order.id) return FIXTURE;
  return null;
}

export function fixtureOrderId(): string {
  return FIXTURE.order.id;
}

export function fixtureSnapshot(): OrderSnapshot {
  return FIXTURE;
}
