import type { Metadata } from "next";
import CheckoutClient from "@/components/checkout/CheckoutClient";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8080";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pooli.shop";

type Preview = {
  store_name?: string;
  title?: string;
  store_logo_url?: string;
};

async function fetchPreview(slug: string): Promise<Preview | null> {
  try {
    const res = await fetch(`${API}/api/v1/public/pay/${slug}/preview`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Preview;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const preview = await fetchPreview(params.slug);
  const store = preview?.store_name || "Pooli";
  const title = preview?.title ? `${preview.title} · ${store}` : `${store} · Pooli`;
  const description = `Checkout with ${store} on Pooli`;
  const images = preview?.store_logo_url
    ? [{ url: preview.store_logo_url.startsWith("http") ? preview.store_logo_url : `${SITE}${preview.store_logo_url}` }]
    : [{ url: "/brand/og-default.png", width: 1200, height: 630, alt: "Pooli" }];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${SITE}/t/p/${params.slug}`,
      siteName: "Pooli",
      images,
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: images.map((i) => i.url),
    },
  };
}

export default function TelegramCheckoutPage({ params }: { params: { slug: string } }) {
  return <CheckoutClient slug={params.slug} chrome="telegram" />;
}
