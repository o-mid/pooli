export function shortenAddress(address: string): string {
  const value = address.trim();
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function networkLabel(network: string, tron: string, bsc: string): string {
  if (network === "tron") return tron;
  if (network === "bsc") return bsc;
  return network.toUpperCase();
}

export function tokenStandard(network: string): string {
  if (network === "tron") return "TRC-20";
  if (network === "bsc") return "BEP-20";
  return "";
}
