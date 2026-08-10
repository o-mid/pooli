/** Shared payment option fields used by buyer checkout handoff. */
export type PaymentNetwork = "tron" | "bsc" | string;

export type PaymentOption = {
  id: string;
  network: PaymentNetwork;
  chain_id?: number | null;
  token_contract?: string;
  destination_address: string;
  /** Exact payable amount as fixed decimal string (no symbol). */
  pay_usdt_amount: string;
  pay_usdt_amount_base_units?: number;
  base_usdt_amount?: string;
  /** Backend-configured asset symbol; do not invent unknown assets. */
  asset?: string;
  token_decimals?: number;
  payment_uri?: string;
  expires_at?: string;
  status?: string;
  quote_rate?: string;
};

export type WalletId = "tronlink" | "walletconnect" | "trust" | "other" | "qr";

export type BrowserEnv = {
  isMobile: boolean;
  isDesktop: boolean;
  isInAppBrowser: boolean;
  inAppKind: "telegram" | "instagram" | "other" | null;
  isIOS: boolean;
  isAndroid: boolean;
};

export type HandoffInput = {
  option: PaymentOption;
  env: BrowserEnv;
  preferredWalletId?: WalletId | null;
  storeName?: string;
  /** Absolute checkout URL for return / open-in-browser. */
  checkoutUrl?: string;
  walletConnectProjectId?: string;
};

export type WalletCandidate = {
  id: WalletId;
  labelKey: "tronlink" | "walletconnect" | "trust" | "other" | "qr";
  recommended?: boolean;
  /** Capability notes for UI — never claim unsupported prefills. */
  canPrefillRecipient: boolean;
  canPrefillAmount: boolean;
  /** How this wallet is launched. */
  kind: "deeplink" | "walletconnect" | "qr" | "copy";
};

export type HandoffPlan = {
  network: PaymentNetwork;
  asset: string;
  primary: WalletCandidate;
  wallets: WalletCandidate[];
  qrPayload: string;
  paymentUri: string;
  /** Desktop prefers QR as primary surface. */
  qrPrimary: boolean;
  showPayWithWallet: boolean;
};

export type LaunchResult =
  | { ok: true; method: string }
  | { ok: false; reason: "unsupported" | "missing_project_id" | "user_rejected" | "failed" | "iab_blocked"; message?: string };
