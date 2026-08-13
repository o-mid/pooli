"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { BackLink } from "@/components/ui/BackLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/LocaleProvider";
import { networkLabel, shortenAddress, tokenStandard } from "@/lib/address";
import { api } from "@/lib/api";

type Wallet = {
  id: string;
  network: string;
  address: string;
  label: string;
  is_default: boolean;
  is_active: boolean;
  explorer_url?: string;
  active_payment_intents?: number;
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
  const { showToast } = useToast();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);

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
      setError(t.wallets.invalidAddress);
      return;
    }

    setDraft({
      network,
      address,
      label,
      is_default: wallets.filter((w) => w.network === network && w.is_active).length === 0 || fd.get("is_default") === "on",
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
      showToast(t.common.saved);
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

  async function archive(id: string) {
    setLoading(true);
    try {
      await api(`/api/v1/wallets/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
      setArchiveId(null);
    }
  }

  async function copyAddr(addr: string) {
    await navigator.clipboard.writeText(addr);
    showToast(t.common.copied);
  }

  return (
    <div className="rise page-stack">
      <BackLink href="/app/settings/getting-paid" />
      <PageHeader title={t.wallets.title} />

      {!draft ? (
        <form className="card-panel" onSubmit={onFormSubmit}>
          <div className="field">
            <label htmlFor="network">{t.wallets.network}</label>
            <select id="network" name="network" defaultValue="tron">
              <option value="tron">{t.wallets.tron}</option>
              <option value="bsc">{t.wallets.bsc}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="address">{t.wallets.address}</label>
            <input id="address" name="address" required placeholder="T… or 0x…" className="mono-ltr" />
          </div>
          <div className="field">
            <label htmlFor="label">{t.wallets.label}</label>
            <input id="label" name="label" placeholder="Instagram" />
          </div>
          {wallets.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
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
                <div className="list-row-title">{networkLabel(draft.network, t.wallets.tron, t.wallets.bsc)}</div>
              </div>
            </div>
            <div className="list-row" style={{ cursor: "default" }}>
              <div className="list-row-body">
                <div className="list-row-meta">{t.wallets.address}</div>
                <div className="list-row-title mono-ltr short-addr">{shortenAddress(draft.address)}</div>
              </div>
            </div>
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
          <div className="list-group">
            {wallets.map((w) => (
              <div key={w.id} className="list-row" style={{ cursor: "default", alignItems: "flex-start" }}>
                <div className="list-row-body" style={{ gap: "var(--space-2)" }}>
                  <div className="list-row-title">
                    {t.wallets.receiving} · {networkLabel(w.network, t.wallets.tron, t.wallets.bsc)} · USDT
                    {w.is_default && w.is_active ? ` · ${t.wallets.default}` : ""}
                  </div>
                  <div className="list-row-meta mono-ltr short-addr">{shortenAddress(w.address)}</div>
                  {w.label ? <div className="list-row-meta">{w.label}</div> : null}
                  <button
                    type="button"
                    className="quiet-link"
                    style={{ background: "none", border: 0, textAlign: "start", padding: 0 }}
                    onClick={() => setOpenId(openId === w.id ? null : w.id)}
                  >
                    {t.wallets.details}
                  </button>
                  {openId === w.id ? (
                    <div style={{ display: "grid", gap: "var(--space-2)" }}>
                      <code className="wallet-addr mono-ltr">{w.address}</code>
                      {tokenStandard(w.network) ? (
                        <div className="list-row-meta">
                          {t.wallets.tokenStandard}: {tokenStandard(w.network)}
                        </div>
                      ) : null}
                      {(w.active_payment_intents || 0) > 0 ? (
                        <div className="list-row-meta">
                          {t.wallets.activeIntents}: {w.active_payment_intents}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                        <button type="button" className="btn btn-tertiary" style={{ width: "auto", minHeight: "var(--control-height-sm)" }} onClick={() => copyAddr(w.address)}>
                          {t.wallets.copy}
                        </button>
                        {w.explorer_url ? (
                          <a className="btn btn-tertiary" style={{ width: "auto", minHeight: "var(--control-height-sm)" }} href={w.explorer_url} target="_blank" rel="noreferrer">
                            {t.wallets.explorer}
                          </a>
                        ) : null}
                        {!w.is_default && w.is_active && (
                          <button type="button" className="btn btn-tertiary" style={{ width: "auto", minHeight: "var(--control-height-sm)" }} disabled={loading} onClick={() => setDefault(w.id)}>
                            {t.wallets.setDefault}
                          </button>
                        )}
                        {w.is_active && (
                          <button type="button" className="btn btn-tertiary" style={{ width: "auto", minHeight: "var(--control-height-sm)" }} disabled={loading} onClick={() => setArchiveId(w.id)}>
                            {t.wallets.archive}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        !draft && <EmptyState title={t.wallets.title}>{t.wallets.empty}</EmptyState>
      )}
      <AlertDialog
        open={Boolean(archiveId)}
        title={t.wallets.archiveConfirm}
        body={
          <>
            <p style={{ margin: 0 }}>{t.wallets.archiveConfirmBody}</p>
            {archiveId && (wallets.find((w) => w.id === archiveId)?.active_payment_intents || 0) > 0 ? (
              <p style={{ margin: "var(--space-2) 0 0" }}>
                {t.wallets.activeIntents}: {wallets.find((w) => w.id === archiveId)?.active_payment_intents}
              </p>
            ) : null}
          </>
        }
        confirmLabel={t.wallets.archive}
        cancelLabel={t.common.cancel}
        destructive
        onConfirm={() => {
          if (archiveId) void archive(archiveId);
        }}
        onCancel={() => setArchiveId(null)}
      />
    </div>
  );
}
