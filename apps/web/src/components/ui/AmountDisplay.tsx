export function AmountDisplay({
  primary,
  secondary,
  emphasize = true,
}: {
  primary: string;
  secondary?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="amount-display">
      <div className={emphasize ? "amount-primary tabular" : "list-row-title tabular"}>{primary}</div>
      {secondary ? <div className="amount-secondary">{secondary}</div> : null}
    </div>
  );
}
