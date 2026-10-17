import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ActionRegistry } from '../domain/registry.js';
import { InMemoryProposalStore } from '../domain/store.js';
import { createInternalApi } from './internal-api.js';

describe('internal api', () => {
  it('registers a proposal with gateway secret', async () => {
    const store = new InMemoryProposalStore();
    const registry = new ActionRegistry(store, { ttlSeconds: 600 });
    const deliver = vi.fn(async () => {});
    const app = createInternalApi({
      registry,
      gatewaySecret: 'test-secret',
      deliverLinkCode: deliver,
      confirmationBaseUrl: 'https://agent.test',
    });

    const server = await new Promise<ReturnType<typeof express.listen>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const res = await fetch(`http://127.0.0.1:${port}/v1/proposals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pooli-Gateway-Secret': 'test-secret',
      },
      body: JSON.stringify({
        orderId: 'ord_e2e_fixture',
        orderSlug: 'ceramic-mug-e2e',
        merchantId: '00000000-0000-4000-8000-000000000001',
        body: 'Hi — here is your checkout link when you are ready.',
        locale: 'en',
        paymentStatus: 'AWAITING_PAYMENT',
        idempotencyKey: 'test_key_1',
      }),
    });

    expect(res.status).toBe(201);
    const json = (await res.json()) as { proposalId: string };
    expect(json.proposalId).toMatch(/^prop_/);
    expect(deliver).toHaveBeenCalled();

    server.close();
  });
});
