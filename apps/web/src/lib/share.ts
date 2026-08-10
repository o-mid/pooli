/** Build concise share text for a payment link. */
export function buildShareText(opts: {
  title?: string;
  amountToman?: number;
  tomanLabel: string;
  completeLabel: string;
  url: string;
}): string {
  const lines: string[] = [];
  if (opts.title?.trim()) lines.push(opts.title.trim());
  if (opts.amountToman && opts.amountToman > 0) {
    lines.push(`${opts.amountToman.toLocaleString()} ${opts.tomanLabel}`);
  }
  lines.push(opts.completeLabel);
  lines.push(opts.url);
  return lines.join("\n");
}

export async function sharePaymentLink(opts: {
  title?: string;
  text: string;
  url: string;
}): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: opts.title || "Pooli",
        text: opts.text,
        url: opts.url,
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(opts.url);
  return "copied";
}

export function telegramShareURL(text: string, url: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

export function whatsappShareURL(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
