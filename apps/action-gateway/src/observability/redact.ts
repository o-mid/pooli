/**
 * Redaction at the logging boundary.
 *
 * A secret that gets logged leaks. Not hypothetically, into CI output, into
 * monitoring, into an error report, into a screenshot someone pastes in chat.
 * The log file is not the boundary of a log's blast radius.
 *
 * The spike already applied this discipline to BORROWED secrets: the
 * Authorization header was recorded as `<present len=783 scheme=Bearer>`,
 * never as its value. It was not applied to our OWN domain secret, and a live
 * link code duly appeared in the gateway's log. This module closes that gap
 * for both, in the one place every log line must pass through.
 *
 * Redaction lives INSIDE the record function rather than at each call site,
 * because a rule enforced at call sites is a rule that holds until someone
 * adds a call site. There is no correct way to log a link code, so the logger
 * refuses on everyone's behalf.
 */

/**
 * Keys whose VALUES must never appear in a log, matched case-insensitively on
 * a substring so `linkCode`, `link_code` and `LinkCode` are all caught.
 *
 * Deliberately broader than what is logged today: the point is to catch the
 * field somebody adds next year without reading this file.
 */
const SECRET_KEYS = [
  'linkcode',
  'link_code',
  'code_verifier',
  'codeverifier',
  'access_token',
  'refresh_token',
  'client_secret',
  'authorization',
  'password',
  'secret',
  'apikey',
  'api_key',
];

/**
 * Keys that merely CONTAIN "code" but are not secrets. Without this, redaction
 * swallows `statusCode`, `errorCode` and `currencyCode`, and a logger that
 * destroys useful diagnostics gets switched off, which is how redaction
 * ends up removed entirely rather than refined.
 */
const NOT_SECRET = /^(status|error|http|currency|country|iso|reason|exit|zip|post)/i;

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  if (NOT_SECRET.test(key)) return false;
  if (SECRET_KEYS.some((s) => k.includes(s))) return true;
  // A bare `code` is an OAuth authorization code in this codebase.
  return k === 'code' || k === 'token';
}

/**
 * Describes a secret without disclosing it.
 *
 * NOTE, and this is the subtle part: it deliberately does NOT include a hash.
 *
 * Hashing looks like the obvious way to keep log lines correlatable while
 * hiding the value, and for a high-entropy token it would be. A link code is
 * six characters over a 31-symbol alphabet, about 28 bits. That entire space
 * can be enumerated in under a second, so a hash of it is not redaction, it is
 * an encoding. Correlating log lines is not worth publishing a brute-forceable
 * commitment to a live secret.
 *
 * Shape only: enough to debug "was a value present, and was it the right
 * length", which is what the Authorization-header pattern already proved is
 * sufficient in practice.
 */
export function describeSecret(value: unknown): string {
  if (value === null || value === undefined) return '<absent>';
  const s = String(value);
  if (s.length === 0) return '<empty>';
  const shape = /^[A-Z0-9]+$/.test(s)
    ? 'upper'
    : /^[a-f0-9]+$/i.test(s)
      ? 'hex'
      : /^[\w-]+$/.test(s)
        ? 'token'
        : 'mixed';
  return `<redacted len=${s.length} shape=${shape}>`;
}

/**
 * Deep-copies a log payload with every secret-keyed value replaced.
 *
 * Recurses because secrets nest, a proposal object carrying a code inside a
 * larger diagnostic payload is exactly the accident this exists to prevent.
 */
export function redact(input: unknown, depth = 0): unknown {
  // Cheap cycle and runaway guard. A logger must not hang or overflow on a
  // structure it was merely asked to describe.
  if (depth > 8) return '<depth-limit>';
  if (input === null || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = isSecretKey(k) ? describeSecret(v) : redact(v, depth + 1);
  }
  return out;
}
