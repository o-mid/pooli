"use client";

export function ErrorRetry({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div className="page-stack" role="alert">
      <p className="field-error" style={{ margin: 0 }}>
        {message}
      </p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
