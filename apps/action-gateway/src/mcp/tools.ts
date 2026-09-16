export const GET_SNAPSHOT_DESCRIPTION = [
  'Reads the canonical order and payment snapshot from Pooli.',
  '**This tool never sends messages, marks orders paid, or moves funds.**',
  'Call it before drafting any buyer follow-up so payment status and amounts',
  'match the commerce API, not conversation memory.',
].join(' ');

export const PROPOSE_MESSAGE_DESCRIPTION = [
  'Registers a *proposal* to send a buyer follow-up message for an order.',
  '**This tool never sends messages to the buyer.**',
  'It records the draft and returns a confirmation reference that the merchant',
  'must approve out-of-band; there is no argument that can make this tool send',
  'or mark an order paid.',
  'Always call get_order_snapshot first for the same order id.',
].join(' ');

export const CHECK_PROPOSAL_DESCRIPTION = [
  'Reports the current status of a message proposal you previously registered.',
  '**This tool is read-only and never sends, confirms, or cancels anything.**',
  'It returns only the lifecycle state. It will never return the confirmation',
  'code, because that code is delivered to the merchant through a separate channel.',
].join(' ');

export const GET_SNAPSHOT_SCHEMA = {
  type: 'object',
  properties: {
    orderId: { type: 'string', description: 'Pooli order id from the merchant dashboard.' },
  },
  required: ['orderId'],
  additionalProperties: false,
} as const;

export const PROPOSE_MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    orderId: { type: 'string', description: 'Order id (must match a recent snapshot).' },
    orderSlug: { type: 'string', description: 'Checkout slug for the pay link.' },
    body: { type: 'string', description: 'Draft message text for the buyer.' },
    locale: { type: 'string', enum: ['en', 'fa'], description: 'Draft locale.' },
    paymentStatus: {
      type: 'string',
      description: 'Payment status from get_order_snapshot at propose time.',
    },
  },
  required: ['orderId', 'orderSlug', 'body', 'locale', 'paymentStatus'],
  additionalProperties: false,
} as const;

export const CHECK_PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    proposalId: { type: 'string', description: 'Proposal id returned by propose_buyer_message.' },
  },
  required: ['proposalId'],
  additionalProperties: false,
} as const;
