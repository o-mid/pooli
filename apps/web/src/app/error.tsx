"use client";

import { useT } from "@/i18n/LocaleProvider";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <main className="shell page-stack">
      <p className="field-error" role="alert">
        {t.common.error}
      </p>
      <button type="button" className="btn btn-primary" onClick={() => reset()}>
        {t.common.retry}
      </button>
    </main>
  );
}
