// Browser calls go through Next.js rewrites (same origin) so session cookies work.
const API_BASE = "";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `request failed (${res.status})`);
  }
  return data as T;
}

export async function apiMultipart<T>(path: string, formData: FormData, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    ...init,
    credentials: "include",
    body: formData,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `request failed (${res.status})`);
  }
  return data as T;
}

export function apiBase() {
  return API_BASE || (typeof window !== "undefined" ? window.location.origin : "");
}

export function openSSE(path: string, onEvent: (type: string, data: unknown) => void) {
  const es = new EventSource(`${API_BASE}${path}`);
  const handler = (type: string) => (ev: MessageEvent) => {
    try {
      onEvent(type, JSON.parse(ev.data));
    } catch {
      onEvent(type, ev.data);
    }
  };
  ["payment.seen", "payment.confirming", "payment.paid", "payment.needs_review"].forEach((t) => {
    es.addEventListener(t, handler(t) as EventListener);
  });
  es.onmessage = (ev) => handler("message")(ev);
  return es;
}
