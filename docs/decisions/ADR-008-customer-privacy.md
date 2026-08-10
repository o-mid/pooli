# ADR-008: Customer PII privacy for commerce UX

## Context

Checkout now persists name, phone, email, address, and postal code for merchant operations.

## Rules

1. Customer and address rows are always `merchant_id`-scoped. Cross-merchant reads return 404.
2. Public checkout GET does not echo submitted `field_values` after submit (`customer_submitted` flag only).
3. Open Graph / preview endpoints never include customer PII or fiat amount.
4. SSE payloads remain payment-status oriented; do not add address/phone bodies to public streams.
5. Logs must not print customer field values (existing OAuth redaction patterns apply; avoid logging request bodies with PII).
6. Retention/deletion: merchants own customer records operationally. Hard deletion / GDPR export tooling is a follow-up; soft isolation is required now.
7. Returning-buyer recognition must verify control of phone/email before revealing saved addresses.

## Follow-up

Secure “welcome back” checkout with OTP (or equivalent) before address reuse.
