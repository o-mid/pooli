import type { MessageDraftPayload } from './types.js';

export const TEST_MESSAGE: MessageDraftPayload = {
  orderId: 'ord_e2e_fixture',
  orderSlug: 'ceramic-mug-e2e',
  merchantId: '00000000-0000-4000-8000-000000000001',
  body: 'Your order is awaiting payment.',
  locale: 'en',
  paymentStatus: 'AWAITING_PAYMENT',
};
