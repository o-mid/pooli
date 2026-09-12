import type { MessageDraftPayload } from './types.js';

export const TEST_MESSAGE: MessageDraftPayload = {
  orderId: 'ord_e2e_fixture',
  orderSlug: 'ceramic-mug-e2e',
  body: 'Your order is awaiting payment.',
  locale: 'en',
  paymentStatus: 'AWAITING_PAYMENT',
};
