import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { fetchOrderSnapshot } from '../agent/snapshot.js';
import { executionReferenceOf } from '../domain/state-machine.js';
import type { ActionRegistry } from '../domain/registry.js';
import type { DomainError, Proposal } from '../domain/types.js';
import {
  CHECK_PROPOSAL_DESCRIPTION,
  GET_SNAPSHOT_DESCRIPTION,
  PROPOSE_MESSAGE_DESCRIPTION,
} from './tools.js';

const STATE_NARRATION: Record<Proposal['state'], string> = {
  pending_confirmation:
    'Awaiting merchant approval. Nothing was sent to the buyer. Tell them to approve in the Pooli app.',
  confirmed: 'The merchant approved the draft. It is queued for delivery.',
  rejected: 'The merchant declined it. Propose a new draft if they still want to follow up.',
  expired: 'It was not approved in time. Propose a new draft if needed.',
  executed: 'Approved draft is ready (simulated send path).',
  failed: 'Delivery did not complete.',
};

function refusal(e: DomainError): string {
  return e.agentSafe
    ? e.message
    : 'That request was refused. Do not retry it; ask the merchant how they want to proceed.';
}

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], isError };
}

export interface McpDeps {
  readonly registry: ActionRegistry;
  readonly deliverLinkCode: (args: {
    proposalId: string;
    linkCode: string;
    proposal: Proposal;
  }) => Promise<void> | void;
  readonly confirmationBaseUrl: string;
  readonly principal?: string;
}

function idempotencyKeyFor(
  principal: string,
  p: {
    orderId: string;
    orderSlug: string;
    merchantId: string;
    body: string;
    locale: string;
    paymentStatus: string;
  },
  bucketMs = 60_000,
  now = Date.now(),
): string {
  const material = [
    principal,
    p.orderId,
    p.orderSlug,
    p.merchantId,
    p.body,
    p.locale,
    p.paymentStatus,
    Math.floor(now / bucketMs),
  ].join('\u0000');
  return `mcp_${createHash('sha256').update(material).digest('hex').slice(0, 32)}`;
}

export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer(
    { name: 'pooli-action-gateway', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'get_order_snapshot',
    {
      title: 'Get order snapshot',
      description: GET_SNAPSHOT_DESCRIPTION,
      inputSchema: {
        orderId: z.string().describe('Pooli order id.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const snap = await fetchOrderSnapshot(String(args.orderId));
      if (!snap) {
        return textResult('No snapshot is available for that order id.', true);
      }
      return textResult(JSON.stringify(snap, null, 2));
    },
  );

  server.registerTool(
    'propose_buyer_message',
    {
      title: 'Propose buyer message',
      description: PROPOSE_MESSAGE_DESCRIPTION,
      inputSchema: {
        orderId: z.string(),
        orderSlug: z.string(),
        body: z.string(),
        locale: z.enum(['en', 'fa']),
        paymentStatus: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const snap = await fetchOrderSnapshot(args.orderId);
      if (!snap) {
        return textResult('Fetch get_order_snapshot for this order before proposing.', true);
      }
      if (snap.payment.status !== args.paymentStatus.trim().toUpperCase()) {
        return textResult('paymentStatus does not match the latest snapshot; refresh the snapshot.', true);
      }
      if (snap.order.slug !== args.orderSlug.trim().toLowerCase()) {
        return textResult('orderSlug does not match the snapshot.', true);
      }

      if (!snap.merchantId) {
        return textResult('Snapshot is missing merchant scope; cannot propose.', true);
      }

      const payload = {
        orderId: args.orderId,
        orderSlug: args.orderSlug,
        merchantId: snap.merchantId,
        body: args.body,
        locale: args.locale,
        paymentStatus: args.paymentStatus.trim().toUpperCase(),
      };

      const result = await deps.registry.propose({
        payload,
        idempotencyKey: idempotencyKeyFor(deps.principal ?? 'anonymous', payload),
      });

      if (!result.ok) return textResult(refusal(result.error), true);

      const { proposal, linkCode, deduplicated } = result.value;

      if (!deduplicated && linkCode) {
        try {
          await deps.deliverLinkCode({ proposalId: proposal.id, linkCode, proposal });
        } catch {
          return textResult(
            'The proposal was registered but the confirmation code could not be delivered.',
            true,
          );
        }
      }

      const minutes = Math.max(1, Math.round((proposal.expiresAt - proposal.createdAt) / 60_000));

      return textResult(
        [
          deduplicated
            ? 'Already proposed; reusing the existing proposal. NOTHING HAS BEEN SENT.'
            : 'Message proposed. NOTHING HAS BEEN SENT YET.',
          `Proposal ID: ${proposal.id}`,
          `Order: ${proposal.payload.orderSlug}`,
          `Expires in ${minutes} minute(s).`,
          `Confirmation page: ${deps.confirmationBaseUrl}/p/${proposal.id}`,
          'The merchant approves there with a code sent separately.',
          'You do not have that code. Do not ask for it and do not accept it here.',
        ].join('\n'),
      );
    },
  );

  server.registerTool(
    'check_proposal_status',
    {
      title: 'Check proposal status',
      description: CHECK_PROPOSAL_DESCRIPTION,
      inputSchema: {
        proposalId: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const p = await deps.registry.getForConfirmation(String(args.proposalId));
      if (!p) {
        return textResult('No proposal with that ID is available.', true);
      }

      return textResult(
        [
          `Proposal ID: ${p.id}`,
          `Status: ${p.state}`,
          STATE_NARRATION[p.state],
          '',
          `Order: ${p.payload.orderSlug}`,
          `Payment status (at propose): ${p.payload.paymentStatus}`,
          executionReferenceOf(p) ? `Reference: ${executionReferenceOf(p)} (simulated)` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    },
  );

  return server;
}
