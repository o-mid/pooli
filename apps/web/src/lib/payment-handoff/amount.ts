/**
 * Scale Pooli 6-decimal base units to on-chain token units (same math as Go PooliBaseToOnChainAmount).
 * Returns decimal string suitable for uint256 hex encoding.
 */
export function pooliBaseToOnChainAmount(baseUnits: number | string, tokenDecimals: number): string {
  const base = BigInt(baseUnits);
  const pooliDecimals = 6;
  if (tokenDecimals === pooliDecimals) return base.toString();
  if (tokenDecimals < pooliDecimals) {
    throw new Error("token decimals too small");
  }
  const shift = BigInt(10) ** BigInt(tokenDecimals - pooliDecimals);
  return (base * shift).toString();
}

/** ERC-20 transfer(address,uint256) calldata. */
export function encodeErc20Transfer(recipient: string, onChainAmount: string): string {
  const selector = "0xa9059cbb";
  const addr = recipient.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const amt = BigInt(onChainAmount).toString(16).padStart(64, "0");
  return `${selector}${addr}${amt}`;
}

export function toHexQuantity(n: number | bigint): string {
  return `0x${BigInt(n).toString(16)}`;
}
