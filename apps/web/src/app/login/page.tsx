"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell rise">
      <p className="brand" style={{ fontSize: "1.8rem" }}>
        Pooli
      </p>
      <h1 style={{ marginTop: 0 }}>Sign in</h1>
      <form className="card-panel" onSubmit={onSubmit}>
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
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: "1rem" }}>
        New here? <Link href="/register">Create account</Link>
      </p>
    </main>
  );
}
