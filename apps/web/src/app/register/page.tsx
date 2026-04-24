"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
          name: fd.get("name"),
          merchant_name: fd.get("merchant_name"),
        }),
      });
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "register failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell rise">
      <p className="brand" style={{ fontSize: "1.8rem" }}>
        Pooli
      </p>
      <h1 style={{ marginTop: 0 }}>Create seller account</h1>
      <form className="card-panel" onSubmit={onSubmit}>
        <div className="field">
          <label>Your name</label>
          <input name="name" required />
        </div>
        <div className="field">
          <label>Store name</label>
          <input name="merchant_name" required />
        </div>
        <div className="field">
          <label>Email</label>
          <input name="email" type="email" required />
        </div>
        <div className="field">
          <label>Password</label>
          <input name="password" type="password" required minLength={8} />
        </div>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: "1rem" }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
