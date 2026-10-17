/**
 * Service-to-service API (Pooli Go API → gateway). Not for browsers or MCP agents.
 */

import express, { type Express, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { ActionRegistry } from '../domain/registry.js';

export interface InternalApiDeps {
  readonly registry: ActionRegistry;
  readonly gatewaySecret: string;
  readonly deliverLinkCode: (args: {
    proposalId: string;
    linkCode: string;
    proposal: import('../domain/types.js').Proposal;
  }) => Promise<void> | void;
  readonly confirmationBaseUrl: string;
}

function secretOk(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createInternalApi(deps: InternalApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.use((req, res, next) => {
    const expected = deps.gatewaySecret.trim();
    const got = String(req.get('x-pooli-gateway-secret') ?? '').trim();
    if (!expected || !got || !secretOk(expected, got)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  });

  app.post('/internal/v1/proposals', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const orderId = String(body.orderId ?? '').trim();
    const orderSlug = String(body.orderSlug ?? '').trim();
    const merchantId = String(body.merchantId ?? '').trim();
    const draftBody = String(body.body ?? '');
    const locale = String(body.locale ?? 'en').trim().toLowerCase();
    const paymentStatus = String(body.paymentStatus ?? '').trim().toUpperCase();
    const idempotencyKey = String(body.idempotencyKey ?? '').trim();

    if (!orderId || !orderSlug || !merchantId || !draftBody || !paymentStatus) {
      return void res.status(400).json({ error: 'invalid_request' });
    }
    if (!idempotencyKey) {
      return void res.status(400).json({ error: 'idempotency_key_required' });
    }

    const payload = {
      orderId,
      orderSlug,
      merchantId,
      body: draftBody,
      locale: locale === 'fa' ? 'fa' : 'en',
      paymentStatus,
    };

    const result = await deps.registry.propose({ payload, idempotencyKey });
    if (!result.ok) {
      const code = result.error.code;
      const status =
        code === 'VALIDATION_FAILED' ? 400 : code === 'IDEMPOTENCY_CONFLICT' ? 409 : 400;
      return void res.status(status).json({
        error: code,
        message: result.error.agentSafe ? result.error.message : 'refused',
      });
    }

    const { proposal, linkCode, deduplicated } = result.value;

    if (!deduplicated && linkCode) {
      try {
        await deps.deliverLinkCode({ proposalId: proposal.id, linkCode, proposal });
      } catch {
        return void res.status(500).json({
          error: 'delivery_failed',
          message: 'Proposal saved but confirmation code could not be delivered.',
        });
      }
    }

    res.status(deduplicated ? 200 : 201).json({
      proposalId: proposal.id,
      deduplicated,
      confirmUrl: `${deps.confirmationBaseUrl}/p/${proposal.id}`,
      state: proposal.state,
    });
  });

  return app;
}
