/**
 * Contracts for the Pooli action gateway (buyer message proposals).
 */

export const PROPOSAL_STATES = [
  'pending_confirmation',
  'confirmed',
  'rejected',
  'expired',
  'executed',
  'failed',
] as const;

export type ProposalState = (typeof PROPOSAL_STATES)[number];

export const TERMINAL_STATES: readonly ProposalState[] = ['rejected', 'expired', 'executed', 'failed'];

export function isTerminal(s: ProposalState): boolean {
  return TERMINAL_STATES.includes(s);
}

/** Draft message to send a buyer after merchant approval. */
export interface MessageDraftPayload {
  readonly orderId: string;
  readonly orderSlug: string;
  readonly merchantId: string;
  readonly body: string;
  readonly locale: string;
  /** Payment status copied from the order snapshot at propose time. */
  readonly paymentStatus: string;
}

export interface Proposal {
  readonly id: string;
  readonly state: ProposalState;
  readonly payload: MessageDraftPayload;
  readonly payloadDigest: string;
  readonly linkCodeHash: string;
  readonly idempotencyKey: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly version: number;
  readonly history: readonly TransitionRecord[];
}

export interface TransitionRecord {
  readonly from: ProposalState;
  readonly to: ProposalState;
  readonly at: number;
  readonly reason: string;
  readonly actor: 'agent' | 'human' | 'system';
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError };

export interface DomainError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly agentSafe: boolean;
}

export type ErrorCode =
  | 'INVALID_STATE'
  | 'EXPIRED'
  | 'LINK_CODE_MISMATCH'
  | 'PAYLOAD_TAMPERED'
  | 'VERSION_CONFLICT'
  | 'VALIDATION_FAILED'
  | 'IDEMPOTENCY_CONFLICT';

export function err(code: ErrorCode, message: string, agentSafe = true): Result<never> {
  return { ok: false, error: { code, message, agentSafe } };
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
