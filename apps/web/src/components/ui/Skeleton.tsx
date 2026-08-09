export function Skeleton({
  height = "1rem",
  width = "100%",
  className = "",
}: {
  height?: string;
  width?: string;
  className?: string;
}) {
  return <div className={`skeleton ${className}`} style={{ height, width }} aria-hidden />;
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="list-group" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="list-row" style={{ cursor: "default" }}>
          <div className="list-row-body" style={{ gap: "0.45rem", width: "100%" }}>
            <Skeleton height="1rem" width="55%" />
            <Skeleton height="0.75rem" width="35%" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="stat-grid" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="stat">
          <Skeleton height="0.7rem" width="40%" />
          <div style={{ marginTop: "0.5rem" }}>
            <Skeleton height="1.4rem" width="50%" />
          </div>
        </div>
      ))}
      <div className="stat wide">
        <Skeleton height="0.7rem" width="30%" />
        <div style={{ marginTop: "0.5rem" }}>
          <Skeleton height="1.4rem" width="20%" />
        </div>
      </div>
    </div>
  );
}
