const SCALE = 1_000_000;

/** Parse merchant USDT input (up to 6 decimals) to base units. */
export function parseUsdtToBaseUnits(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,6})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const padded = (frac + "000000").slice(0, 6);
  const wholeN = Number(whole);
  const fracN = Number(padded || "0");
  if (!Number.isFinite(wholeN) || !Number.isFinite(fracN)) return null;
  const base = wholeN * SCALE + fracN;
  if (!Number.isInteger(base) || base <= 0 || base > Number.MAX_SAFE_INTEGER) return null;
  return base;
}

export function formatUsdtFromBaseUnits(base: number): string {
  if (!Number.isFinite(base) || base <= 0) return "0";
  const whole = Math.floor(base / SCALE);
  const frac = String(base % SCALE).padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

export function isValidUsdtAmount(input: string): boolean {
  return parseUsdtToBaseUnits(input) !== null;
}
