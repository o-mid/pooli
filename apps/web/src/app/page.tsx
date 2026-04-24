import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="shell rise">
      <p className="brand" style={{ fontSize: "2.4rem", margin: "2rem 0 0.4rem" }}>
        Pooli
      </p>
      <h1 style={{ fontSize: "1.55rem", margin: "0 0 0.75rem", maxWidth: "18ch" }}>
        Turn a DM order into a checkout link.
      </h1>
      <p className="muted" style={{ marginBottom: "1.5rem", lineHeight: 1.5 }}>
        Create a payment link. Get paid directly in USDT. Know automatically when the payment is real.
      </p>
      <div className="card-panel" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          Non-custodial TRON + BNB Smart Chain checkout for Instagram, Telegram, and WhatsApp sellers.
        </p>
      </div>
      <Link className="btn btn-primary" href="/login" style={{ marginBottom: "0.75rem" }}>
        Open seller app
      </Link>
      <Link className="btn btn-secondary" href="/register">
        Create account
      </Link>
    </main>
  );
}
