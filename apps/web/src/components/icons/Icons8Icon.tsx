import Image from "next/image";

/** Self-hosted Icons8 m_outlined PNGs — see apps/web/icons8.json */
const SIZES = { sm: 20, md: 24, lg: 32 } as const;

export type Icons8Name =
  | "home"
  | "orders"
  | "customers"
  | "settings"
  | "verified"
  | "wallet"
  | "add-link"
  | "share"
  | "notification"
  | "globe"
  | "bot"
  | "sparkles"
  | "link";

export function Icons8Icon({
  name,
  size = "md",
  className = "",
  decorative = true,
}: {
  name: Icons8Name;
  size?: keyof typeof SIZES;
  className?: string;
  decorative?: boolean;
}) {
  const px = SIZES[size];
  return (
    <Image
      src={`/icons/icons8/${name}.png`}
      alt={decorative ? "" : name}
      width={px}
      height={px}
      className={`icons8-icon icons8-icon-${size} ${className}`.trim()}
      aria-hidden={decorative}
    />
  );
}
