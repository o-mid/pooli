/**
 * Order snapshot for agent grounding (fixture for local e2e; production calls Pooli API).
 */

export interface OrderSnapshot {
  readonly schemaVersion: 1;
  readonly merchantId: string;
  readonly order: { readonly id: string; readonly title: string; readonly slug: string };
  readonly payment: { readonly status: string; readonly expiresAt: string | null };
  readonly amountUsdt: { readonly display: string; readonly baseUnits: number };
}

const FIXTURE: OrderSnapshot = {
  schemaVersion: 1,
  merchantId: '00000000-0000-4000-8000-000000000001',
  order: { id: 'ord_e2e_fixture', title: 'Ceramic mug set', slug: 'ceramic-mug-e2e' },
  payment: { status: 'AWAITING_PAYMENT', expiresAt: '2030-01-01T00:00:00Z' },
  amountUsdt: { display: '12.50', baseUnits: 12_500_000 },
};

function pooliApiBase(): string | null {
  const raw = process.env.POOLI_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

function gatewaySecret(): string | null {
  const s = process.env.POOLI_GATEWAY_SECRET?.trim() || process.env.AGENT_GATEWAY_SECRET?.trim();
  return s || null;
}

function formatUsdtDisplay(baseUnits: number): string {
  if (!Number.isFinite(baseUnits) || baseUnits <= 0) return '0';
  const whole = Math.floor(baseUnits / 1_000_000);
  const frac = String(baseUnits % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

function mapPooliApiSnapshot(body: Record<string, unknown>): OrderSnapshot | null {
  const merchantId = String(body.merchant_id ?? '');
  const orderId = String(body.order_id ?? '');
  const slug = String(body.slug ?? '');
  const title = String(body.title ?? '');
  const pay = body.payment as Record<string, unknown> | undefined;
  const status = String(pay?.status ?? body.status ?? '');
  if (!merchantId || !orderId || !slug) return null;

  let expiresAt: string | null = null;
  if (pay?.expires_at) {
    expiresAt = String(pay.expires_at);
  }

  const baseUnits = Number(body.amount_usdt_base_units ?? 0);
  return {
    schemaVersion: 1,
    merchantId,
    order: { id: orderId, title, slug },
    payment: { status, expiresAt },
    amountUsdt: { display: formatUsdtDisplay(baseUnits), baseUnits },
  };
}

async function fetchSnapshotFromApi(orderId: string): Promise<OrderSnapshot | null> {
  const base = pooliApiBase();
  const secret = gatewaySecret();
  if (!base || !secret) return null;

  const url = `${base}/api/v1/agent/orders/${encodeURIComponent(orderId)}/snapshot`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Pooli-Gateway-Secret': secret,
  };

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    return null;
  }

  if (res.status === 404) return null;
  if (!res.ok) return null;

  try {
    const body = (await res.json()) as Record<string, unknown>;
    return mapPooliApiSnapshot(body);
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
