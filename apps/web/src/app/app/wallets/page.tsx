"use client";

import { FormEvent, useEffect, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";

type Wallet = {
  id: string;
  network: string;
  address: string;
  label: string;
  is_default: boolean;
  is_active: boolean;
};

type Draft = {
  network: string;
  address: string;
  label: string;
  is_default: boolean;
};

function validateAddress(network: string, address: string): boolean {
  const trimmed = address.trim();
  if (network === "tron") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);
  if (network === "bsc") return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  return trimmed.length > 8;
}

export default function WalletsPage() {
  const t = useT();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const d = await api<{ wallets: Wallet[] }>("/api/v1/wallets");
    setWallets(d.wallets);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  function onFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const network = String(fd.get("network"));
    const address = String(fd.get("address")).trim();
    const label = String(fd.get("label")).trim();

    if (!validateAddress(network, address)) {
      setError(t.common.error);
      return;
    }

    setDraft({
      network,
      address,
      label,
      is_default: wallets.length === 0 || fd.get("is_default") === "on",
    });
  }

  async function confirmSave() {
    if (!draft) return;
    setLoading(true);
    setError("");
    try {
      await api("/api/v1/wallets", {
        method: "POST",
        body: JSON.stringify({
          network: draft.network,
          address: draft.address,
          label: draft.label,
          is_default: draft.is_default,
        }),
      });
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  async function copyAddress(address: string, id: string) {
    await navigator.clipboard.writeText(address);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function setDefault(id: string) {
    setLoading(true);
    try {
      await api(`/api/v1/wallets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_default: true }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rise">
      <h1 style={{ marginTop: 0 }}>{t.wallets.title}</h1>

      {!draft ? (
        <form className="card-panel" onSubmit={onFormSubmit}>
          <div className="field">
            <label htmlFor="network">{t.wallets.network}</label>
            <select id="network" name="network" defaultValue="tron">
              <option value="tron">TRON (TRC-20)</option>
              <option value="bsc">BNB Smart Chain (BEP-20)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="address">{t.wallets.address}</label>
            <input id="address" name="address" required placeholder="T… or 0x…" className="mono-ltr" />
          </div>
          <div className="field">
            <label htmlFor="label">{t.wallets.label}</label>
            <input id="label" name="label" />
          </div>
          {wallets.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
              <input type="checkbox" name="is_default" defaultChecked />
              <span>{t.wallets.default}</span>
            </label>
          )}
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary">{t.wallets.add}</button>
        </form>
      ) : (
        <div className="card-panel">
          <h3 style={{ marginTop: 0 }}>{t.wallets.confirmTitle}</h3>
          <p className="warn" style={{ lineHeight: 1.5 }}>
            {t.wallets.confirmWarn}
          </p>
          <div style={{ marginBottom: "0.75rem" }}>
            <div className="muted">{t.wallets.network}</div>
            <strong>{draft.network.toUpperCase()}</strong>
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <div className="muted">{t.wallets.address}</div>
            <div className="mono-ltr wallet-addr">{draft.address}</div>
          </div>
          {draft.label && (
            <div style={{ marginBottom: "0.75rem" }}>
              <div className="muted">{t.wallets.label}</div>
              <div>{draft.label}</div>
            </div>
          )}
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary" disabled={loading} onClick={confirmSave}>
            {loading ? t.common.loading : t.wallets.save}
          </button>
          <button
            className="btn btn-secondary"
            style={{ marginTop: "0.5rem" }}
            disabled={loading}
            onClick={() => setDraft(null)}
          >
            {t.common.back}
          </button>
        </div>
      )}

      <div style={{ marginTop: "1rem", display: "grid", gap: "0.65rem" }}>
        {wallets.map((w) => (
          <div key={w.id} className="card-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <strong>{w.label || w.network.toUpperCase()}</strong>
              <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                {w.is_default && <span className="badge">{t.wallets.default}</span>}
                {!w.is_active && <span className="badge">{t.wallets.inactive}</span>}
              </div>
            </div>
            <div className="mono-ltr wallet-addr" style={{ marginTop: "0.35rem" }}>
              {w.address}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => copyAddress(w.address, w.id)}>
                {copiedId === w.id ? t.common.copied : t.wallets.copy}
              </button>
              {!w.is_default && w.is_active && (
                <button className="btn btn-ghost" style={{ flex: 1 }} disabled={loading} onClick={() => setDefault(w.id)}>
                  {t.wallets.default}
                </button>
              )}
            </div>
          </div>
        ))}
        {!wallets.length && !draft && <p className="muted">{t.wallets.empty}</p>}
      </div>
    </div>
  );
}
