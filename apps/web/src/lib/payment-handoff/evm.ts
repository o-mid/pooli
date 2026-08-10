import { encodeErc20Transfer, pooliBaseToOnChainAmount, toHexQuantity } from "./amount";
import type { HandoffInput, LaunchResult } from "./types";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  connect?: (opts?: { chains?: number[] }) => Promise<void>;
  disconnect?: () => Promise<void>;
  enable?: () => Promise<string[]>;
  accounts?: string[];
};

type CachedWC = {
  projectId: string;
  chainId: number;
  provider: EthereumProvider;
};

let cachedWC: CachedWC | null = null;
let providerInit: Promise<EthereumProvider | null> | null = null;

function wcProjectId(explicit?: string): string {
  return (
    explicit ||
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID : "") ||
    ""
  ).trim();
}

async function dropWalletConnectProvider(): Promise<void> {
  const prev = cachedWC?.provider;
  cachedWC = null;
  providerInit = null;
  if (prev && typeof prev.disconnect === "function") {
    try {
      await prev.disconnect();
    } catch {
      // best-effort session cleanup
    }
  }
}

async function getWalletConnectProvider(projectId: string, chainId: number): Promise<EthereumProvider | null> {
  if (!projectId) return null;
  if (cachedWC && cachedWC.projectId === projectId && cachedWC.chainId === chainId) {
    return cachedWC.provider;
  }
  if (cachedWC) {
    await dropWalletConnectProvider();
  }
  if (!providerInit) {
    providerInit = (async () => {
      try {
        const mod = await import("@walletconnect/ethereum-provider");
        const EthereumProviderCtor = mod.default;
        const provider = (await EthereumProviderCtor.init({
          projectId,
          chains: [chainId],
          optionalChains: [chainId],
          showQrModal: true,
          methods: ["eth_sendTransaction", "eth_chainId", "eth_accounts", "wallet_switchEthereumChain", "wallet_addEthereumChain"],
          events: ["chainChanged", "accountsChanged"],
          metadata: {
            name: "Pooli",
            description: "Pay merchants with USDT",
            url: typeof window !== "undefined" ? window.location.origin : "https://pooli.shop",
            icons: [typeof window !== "undefined" ? `${window.location.origin}/icon.png` : "https://pooli.shop/icon.png"],
          },
        })) as unknown as EthereumProvider;
        cachedWC = { projectId, chainId, provider };
        return provider;
      } catch {
        providerInit = null;
        cachedWC = null;
        return null;
      }
    })();
  }
  return providerInit;
}

const BSC_ADD_CHAIN = {
  chainId: "0x38",
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org"],
  blockExplorerUrls: ["https://bscscan.com"],
};

async function ensureChain(provider: EthereumProvider, chainId: number): Promise<void> {
  const hex = toHexQuantity(chainId);
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902 || code === -32603) {
      if (chainId === 56) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [BSC_ADD_CHAIN],
        });
        return;
      }
    }
    throw err;
  }
}

/**
 * WalletConnect-mediated ERC-20 transfer. Prefills recipient + amount when wallet supports eth_sendTransaction.
 */
export async function payWithWalletConnect(input: HandoffInput): Promise<LaunchResult> {
  const projectId = wcProjectId(input.walletConnectProjectId);
  if (!projectId) {
    return { ok: false, reason: "missing_project_id" };
  }

  const option = input.option;
  const chainId = Number(option.chain_id || 0);
  const token = option.token_contract || "";
  const recipient = option.destination_address || "";
  const baseUnits = option.pay_usdt_amount_base_units;
  const decimals = option.token_decimals ?? (option.network === "bsc" ? 18 : 6);

  if (!chainId || !token || !recipient || baseUnits == null) {
    return { ok: false, reason: "unsupported", message: "Missing EVM payment fields" };
  }

  try {
    const provider = await getWalletConnectProvider(projectId, chainId);
    if (!provider) {
      return { ok: false, reason: "failed", message: "WalletConnect unavailable" };
    }

    if (typeof provider.connect === "function") {
      await provider.connect({ chains: [chainId] });
    } else if (typeof provider.enable === "function") {
      await provider.enable();
    } else {
      await provider.request({ method: "eth_requestAccounts" });
    }

    await ensureChain(provider, chainId);

    const accounts =
      (provider.accounts && provider.accounts.length
        ? provider.accounts
        : ((await provider.request({ method: "eth_accounts" })) as string[])) || [];
    const from = accounts[0];
    if (!from) {
      return { ok: false, reason: "failed", message: "No wallet account" };
    }

    const onChain = pooliBaseToOnChainAmount(baseUnits, decimals);
    const data = encodeErc20Transfer(recipient, onChain);

    await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from,
          to: token,
          data,
          value: "0x0",
        },
      ],
    });

    return { ok: true, method: "walletconnect" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Drop a broken/hung session so the next attempt can re-init cleanly.
    if (!/reject|denied|cancel/i.test(msg)) {
      void dropWalletConnectProvider();
    }
    if (/reject|denied|cancel/i.test(msg)) {
      return { ok: false, reason: "user_rejected", message: msg };
    }
    return { ok: false, reason: "failed", message: msg };
  }
}

/** Fallback: open EIP-681 URI (may not prefill amount/token in many wallets). */
export function launchEip681(input: HandoffInput): LaunchResult {
  const uri = input.option.payment_uri || "";
  if (!uri || typeof window === "undefined") {
    return { ok: false, reason: "unsupported" };
  }
  try {
    window.location.href = uri;
    return { ok: true, method: "eip681" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
