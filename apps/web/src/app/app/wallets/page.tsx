"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Wallet = {
  id: string;
  network: string;
  address: string;
  label: string;
  is_default: boolean;
  is_active: boolean;
};

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const d = await api<{ wallets: Wallet[] }>("/api/v1/wallets");
    setWallets(d.wallets);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/v1/wallets", {
        method: "POST",
        body: JSON.stringify({
          network: fd.get("network"),
          address: fd.get("address"),
          label: fd.get("label"),
          is_default: true,
        }),
      });
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    }
  }

  return (
    <div className="rise">
      <h1>Wallets</h1>
      <p className="muted">Public receiving addresses only. Pooli never asks for private keys.</p>
      <form className="card-panel" onSubmit={onSubmit}>
        <div className="field">
          <label>Network</label>
          <select name="network" defaultValue="tron">
            <option value="tron">TRON (TRC-20)</option>
            <option value="bsc">BNB Smart Chain (BEP-20)</option>
          </select>
        </div>
        <div className="field">
          <label>Address</label>
          <input name="address" required placeholder="T... or 0x..." />
        </div>
        <div className="field">
          <label>Label</label>
          <input name="label" placeholder="Instagram Store" />
        </div>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn btn-primary">Add wallet</button>
      </form>
      <div style={{ marginTop: "1rem", display: "grid", gap: "0.65rem" }}>
        {wallets.map((w) => (
          <div key={w.id} className="card-panel">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{w.label || w.network}</strong>
              <span className="muted">{w.network.toUpperCase()}</span>
            </div>
            <div style={{ wordBreak: "break-all", marginTop: "0.35rem" }}>{w.address}</div>
            {w.is_default && <div className="ok">Default</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
