"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Me = {
  merchant?: {
    display_name?: string;
    name?: string;
    logo_url?: string;
  };
};

export function MerchantChrome() {
  const [store, setStore] = useState<{ name: string; logo?: string } | null>(null);

  useEffect(() => {
    api<Me>("/api/v1/me")
      .then((d) => {
        const name = d.merchant?.display_name || d.merchant?.name || "";
        if (!name) return;
        setStore({ name, logo: d.merchant?.logo_url });
      })
      .catch(() => undefined);
  }, []);

  if (!store) return null;

  const initial = store.name.slice(0, 1).toUpperCase();

  return (
    <div className="merchant-chrome">
      <div className="merchant-avatar merchant-avatar-sm">
        {store.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logo} alt="" />
        ) : (
          initial
        )}
      </div>
      <span className="merchant-chrome-name">{store.name}</span>
    </div>
  );
}
