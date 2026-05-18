/** Normalize Iranian mobile numbers to E.164 (+98…). */
export function normalizeIranianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  let national = digits;
  if (national.startsWith("98")) national = national.slice(2);
  if (national.startsWith("0")) national = national.slice(1);
  if (!/^9\d{9}$/.test(national)) return null;
  return `+98${national}`;
}

export function isValidIranianPhone(input: string): boolean {
  return normalizeIranianPhone(input) !== null;
}

export function isValidIranianPostalCode(input: string): boolean {
  return /^\d{10}$/.test(input.trim());
}
