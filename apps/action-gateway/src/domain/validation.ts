/**
 * Server-side validation for buyer message proposals.
 */

import { type Result, type MessageDraftPayload, err, ok } from './types.js';

export const MAX_BODY_LEN = 2_000;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const ORDER_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const LOCALES = new Set(['en', 'fa']);
const PAYMENT_STATUSES = new Set([
  'AWAITING_PAYMENT',
  'PAID',
  'UNDERPAID',
  'NEEDS_REVIEW',
  'EXPIRED',
  'CANCELLED',
]);

const PAID_CLAIM_RE =
  /\b(paid|payment received|payment confirmed|payment is confirmed|received your payment|payment in full)\b|(?:پرداخت\s*شد|واریز\s*شد)/iu;

function sanitizeBody(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reject drafts that claim payment when snapshot status is not PAID. */
export function lintFalsePaidClaim(body: string, paymentStatus: string): Result<true> {
  if (paymentStatus === 'PAID') return ok(true);
  if (PAID_CLAIM_RE.test(body)) {
    return err(
      'VALIDATION_FAILED',
      'draft must not claim the order is paid unless payment status is PAID',
    );
  }
  return ok(true);
}

export function validateMessageDraft(p: MessageDraftPayload): Result<MessageDraftPayload> {
  const orderId = p.orderId.trim();
  const orderSlug = p.orderSlug.trim().toLowerCase();
  const locale = p.locale.trim().toLowerCase();
  const paymentStatus = p.paymentStatus.trim().toUpperCase();

  if (!ORDER_ID_RE.test(orderId)) {
    return err('VALIDATION_FAILED', 'order id is not in a valid format');
  }
  if (!SLUG_RE.test(orderSlug)) {
    return err('VALIDATION_FAILED', 'order slug is not in a valid format');
  }
  if (!LOCALES.has(locale)) {
    return err('VALIDATION_FAILED', 'unsupported locale');
  }
  if (!PAYMENT_STATUSES.has(paymentStatus)) {
    return err('VALIDATION_FAILED', 'unsupported payment status');
  }

  const body = sanitizeBody(p.body);
  if (body.length < 1) {
    return err('VALIDATION_FAILED', 'message body is required');
  }
  if (body.length > MAX_BODY_LEN) {
    return err('VALIDATION_FAILED', `message must be ${MAX_BODY_LEN} characters or fewer`);
  }

  const lint = lintFalsePaidClaim(body, paymentStatus);
  if (!lint.ok) return lint;

  return ok({ orderId, orderSlug, body, locale, paymentStatus });
}
