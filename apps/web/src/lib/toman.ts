/** Format digits with thousand separators while typing (Latin digits). */
export function formatTomanInput(raw: string): string {
  const digits = toLatinDigits(raw).replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

function toLatinDigits(raw: string): string {
  return String(raw).replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return ch;
  });
}

export function parseTomanInput(formatted: string): number {
  const n = Number(toLatinDigits(formatted).replace(/,/g, "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function isValidTomanAmount(formatted: string): boolean {
  const n = parseTomanInput(formatted);
  return Number.isInteger(n) && n > 0;
}
