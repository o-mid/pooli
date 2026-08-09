/** Format digits with thousand separators while typing (Latin digits). */
export function formatTomanInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

export function parseTomanInput(formatted: string): number {
  const n = Number(String(formatted).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function isValidTomanAmount(formatted: string): boolean {
  const n = parseTomanInput(formatted);
  return Number.isInteger(n) && n > 0;
}
