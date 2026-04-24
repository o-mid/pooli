"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api("/api/v1/me").then(setMe).catch(() => undefined);
  }, []);

  async function connectTelegram(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/api/v1/telegram/connect", {
      method: "POST",
      body: JSON.stringify({ chat_id: fd.get("chat_id") }),
    });
    setMsg("Telegram connected");
  }

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="rise">
      <h1>Settings</h1>
      <div className="card-panel">
        <p>
          <strong>{me?.merchant?.name || "—"}</strong>
        </p>
        <p className="muted">{me?.user?.email}</p>
      </div>
      <form className="card-panel" style={{ marginTop: "1rem" }} onSubmit={connectTelegram}>
        <h3 style={{ marginTop: 0 }}>Telegram notifications</h3>
        <div className="field">
          <label>Chat ID</label>
          <input name="chat_id" placeholder="123456789" required />
        </div>
        <button className="btn btn-primary">Save</button>
        {msg && <p className="ok">{msg}</p>}
      </form>
      {me?.user?.IsAdmin || me?.user?.is_admin ? (
        <a className="btn btn-secondary" href="/admin" style={{ marginTop: "1rem", display: "block", textAlign: "center" }}>
          Admin
        </a>
      ) : null}
      <button className="btn btn-secondary" style={{ marginTop: "1rem" }} onClick={logout}>
        Sign out
      </button>
    </div>
  );
}
