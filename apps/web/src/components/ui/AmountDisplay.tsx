export function AmountDisplay({
  primary,
  secondary,
  emphasize = true,
  primaryClassName,
}: {
  primary: string;
  secondary?: string;
  emphasize?: boolean;
  primaryClassName?: string;
}) {
  const primaryCls = [
    emphasize ? "amount-primary tabular" : "list-row-title tabular",
    primaryClassName,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="amount-display">
      <div className={primaryCls}>{primary}</div>
      {secondary ? <div className="amount-secondary">{secondary}</div> : null}
    </div>
  );
}
