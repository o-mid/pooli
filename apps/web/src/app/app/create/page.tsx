"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";

export default function CreateOrderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ checkout_url: string; id: string; slug: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const amount = Number(String(fd.get("amount")).replace(/,/g, ""));
    try {
      const res = await api<{ checkout_url: string; id: string; slug: string }>("/api/v1/orders", {
        method: "POST",
        body: JSON.stringify({
          fiat_amount_toman: amount,
          title: fd.get("title") || "",
          description: fd.get("description") || "",
          merchant_reference: fd.get("reference") || "",
          networks: ["tron", "bsc"],
        }),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="rise">
        <h1>Link ready</h1>
        <div className="card-panel" style={{ textAlign: "center" }}>
          <QRCodeSVG value={result.checkout_url} size={180} bgColor="transparent" fgColor="#f3f7f4" />
          <p style={{ wordBreak: "break-all", marginTop: "1rem" }}>{result.checkout_url}</p>
          <button
            className="btn btn-primary"
            style={{ marginBottom: "0.5rem" }}
            onClick={() => navigator.clipboard.writeText(result.checkout_url)}
          >
            Copy Link
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              if (navigator.share) navigator.share({ url: result.checkout_url, title: "Pooli checkout" });
            }}
          >
            Share
          </button>
        </div>
        <button className="btn btn-secondary" style={{ marginTop: "1rem" }} onClick={() => router.push(`/app/orders/${result.id}`)}>
          Open order
        </button>
      </div>
    );
  }

  return (
    <div className="rise">
      <h1>Create order</h1>
      <p className="muted">Amount + optional details. Share in under 10 seconds.</p>
      <form className="card-panel" onSubmit={onSubmit}>
        <div className="field">
          <label>Amount (Toman)</label>
          <input name="amount" inputMode="numeric" placeholder="3800000" required />
        </div>
        <div className="field">
          <label>Title (optional)</label>
          <input name="title" placeholder="Blue hoodie" />
        </div>
        <details>
          <summary className="muted" style={{ cursor: "pointer", marginBottom: "0.75rem" }}>
            Advanced
          </summary>
          <div className="field">
            <label>Description</label>
            <textarea name="description" rows={3} />
          </div>
          <div className="field">
            <label>Merchant reference</label>
            <input name="reference" placeholder="1842" />
          </div>
        </details>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Generating…" : "Generate Link"}
        </button>
      </form>
    </div>
  );
}
