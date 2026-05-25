"use client";

type Props = {
  variant?: "full" | "mark" | "wordmark";
  tone?: "color" | "mono" | "onDark" | "onLight";
  localeHint?: "en" | "fa";
  className?: string;
  size?: number;
};

export function BrandMark({
  variant = "full",
  tone = "color",
  localeHint = "en",
  className = "",
  size = 28,
}: Props) {
  const ink = tone === "onDark" || tone === "mono" ? "#F4F7F5" : tone === "onLight" ? "#0B1F1A" : "#0B1F1A";
  const accent = tone === "mono" ? ink : "#0F8F6B";
  const word = localeHint === "fa" ? "پولی" : "Pooli";

  if (variant === "mark") {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden
        role="img"
      >
        <rect width="64" height="64" rx="16" fill={accent} />
        <path
          d="M18 42V22h14.5c6.2 0 10.2 3.5 10.2 9.1S38.7 40.2 32.5 40.2H26V42H18zm8-9.2h5.8c2.6 0 4.1-1.3 4.1-3.7s-1.5-3.7-4.1-3.7H26v7.4z"
          fill="#fff"
        />
      </svg>
    );
  }

  return (
    <span className={`brand-lockup ${className}`} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="16" fill={accent} />
        <path
          d="M18 42V22h14.5c6.2 0 10.2 3.5 10.2 9.1S38.7 40.2 32.5 40.2H26V42H18zm8-9.2h5.8c2.6 0 4.1-1.3 4.1-3.7s-1.5-3.7-4.1-3.7H26v7.4z"
          fill="#fff"
        />
      </svg>
      {(variant === "full" || variant === "wordmark") && (
        <span className="brand-word" style={{ color: ink, fontWeight: 700, fontSize: size * 0.72, letterSpacing: "-0.03em" }}>
          {word}
        </span>
      )}
    </span>
  );
}
