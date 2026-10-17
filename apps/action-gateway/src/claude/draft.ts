/**
 * Anthropic Messages API — buyer follow-up drafts from order snapshots.
 */

import type { OrderSnapshot } from '../agent/snapshot.js';

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

export interface DraftBuyerMessageInput {
  readonly snapshot: OrderSnapshot;
  readonly locale: 'en' | 'fa';
  readonly apiKey: string;
  readonly model?: string;
}

function paymentStatusForSnap(snap: OrderSnapshot): string {
  return snap.payment.status.trim().toUpperCase();
}

function systemPrompt(locale: 'en' | 'fa'): string {
  const lang = locale === 'fa' ? 'Persian (Farsi)' : 'English';
  return [
    'You write short buyer follow-up messages for a DM commerce seller using Pooli checkout.',
    `Write in ${lang}.`,
    'Rules:',
    '- One or two short paragraphs maximum. No markdown.',
    '- Never claim payment is received or confirmed unless payment status is exactly PAID.',
    '- If status is AWAITING_PAYMENT, you may remind them to pay via the checkout link politely.',
    '- Do not invent amounts, wallet addresses, or transaction ids not in the snapshot.',
    '- Do not mention Pooli as a bank or custodian; funds go to the seller wallet.',
    'Return only the message text the seller would paste into Instagram or Telegram.',
  ].join('\n');
}

function userPrompt(snap: OrderSnapshot): string {
  return JSON.stringify(
    {
      order: snap.order,
      payment: snap.payment,
      amountUsdt: snap.amountUsdt,
    },
    null,
    2,
  );
}

export async function draftBuyerMessageWithClaude(input: DraftBuyerMessageInput): Promise<string> {
  const key = input.apiKey.trim();
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  const model = (input.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL).trim();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: systemPrompt(input.locale),
      messages: [{ role: 'user', content: userPrompt(input.snapshot) }],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`anthropic api error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('')
    .trim();

  if (!text) {
    throw new Error('anthropic returned empty draft');
  }
  return text;
}

export { paymentStatusForSnap };
