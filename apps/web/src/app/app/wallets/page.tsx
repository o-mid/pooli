"use client";

import { FormEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { WalletAddress } from "@/components/ui/WalletAddress";
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
    <div className="rise page-stack">
      <PageHeader title={t.wallets.title} />

      {!draft && (
        <div className="alert alert-warning" role="note">
          {t.wallets.confirmWarn}
        </div>
      )}

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
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                marginBottom: "var(--space-3)",
              }}
            >
              <input type="checkbox" name="is_default" defaultChecked />
              <span>{t.wallets.default}</span>
            </label>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary">{t.wallets.add}</button>
        </form>
      ) : (
        <div className="card-panel">
          <h2 style={{ margin: 0, fontSize: "var(--text-title3)" }}>{t.wallets.confirmTitle}</h2>
          <div className="alert alert-warning" role="alert" style={{ marginTop: "var(--space-3)" }}>
            {t.wallets.confirmWarn}
          </div>
          <div className="list-group" style={{ marginBottom: "var(--space-4)" }}>
            <div className="list-row" style={{ cursor: "default" }}>
              <div className="list-row-body">
                <div className="list-row-meta">{t.wallets.network}</div>
                <div className="list-row-title">{draft.network.toUpperCase()}</div>
              </div>
            </div>
            <div className="list-row" style={{ cursor: "default", alignItems: "flex-start" }}>
              <div className="list-row-body">
                <div className="list-row-meta">{t.wallets.address}</div>
                <WalletAddress address={draft.address} showCopy={false} />
              </div>
            </div>
            {draft.label ? (
              <div className="list-row" style={{ cursor: "default" }}>
                <div className="list-row-body">
                  <div className="list-row-meta">{t.wallets.label}</div>
                  <div className="list-row-title">{draft.label}</div>
                </div>
              </div>
            ) : null}
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="cta-stack">
            <button className="btn btn-primary" disabled={loading} onClick={confirmSave}>
              {loading ? t.common.loading : t.wallets.save}
            </button>
            <button className="btn btn-secondary" disabled={loading} onClick={() => setDraft(null)}>
              {t.common.back}
            </button>
          </div>
        </div>
      )}

      {wallets.length > 0 ? (
        <section className="section">
          <h2 className="section-title">{t.wallets.title}</h2>
          <div className="list-group">
            {wallets.map((w) => (
              <div key={w.id} className="list-row" style={{ cursor: "default", alignItems: "flex-start" }}>
                <div className="list-row-body" style={{ gap: "var(--space-2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
                    <div className="list-row-title">{w.label || w.network.toUpperCase()}</div>
                    <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                      {w.is_default && <span className="status-badge paid">{t.wallets.default}</span>}
                      {!w.is_active && <span className="status-badge expired">{t.wallets.inactive}</span>}
                    </div>
                  </div>
                  <WalletAddress address={w.address} />
                  {!w.is_default && w.is_active && (
                    <button
                      type="button"
                      className="btn btn-tertiary"
                      style={{ width: "auto", alignSelf: "flex-start", minHeight: "var(--control-height-sm)" }}
                      disabled={loading}
                      onClick={() => setDefault(w.id)}
                    >
                      {t.wallets.default}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        !draft && (
          <EmptyState>
            <p>{t.wallets.empty}</p>
          </EmptyState>
        )
      )}
    </div>
  );
}
