# Typography

## Families

| Use | Family |
|-----|--------|
| English UI | DM Sans |
| Persian UI | Vazirmatn Variable |
| FA brand wordmark | Peyda Black (marketing / logo, not UI body) |
| Technical IDs | ui-monospace / `.mono-ltr` |

## Ramp (HIG Large → rem @ 16px)

Defined in `globals.css`:

| Role | Token | Size |
|------|-------|------|
| Display / page title | `--type-display` / `--text-large-title` | 34px |
| Monetary | `--type-monetary` / `--text-title1` | 28px, tabular nums |
| Section | `--type-section` / `--text-headline` | 17px semibold |
| Body | `--type-body` / `--text-body` | 17px |
| Secondary | `--type-secondary` / `--text-subhead` | 15px |
| Label / caption | `--type-label` / `--text-caption` | 12–13px |
| Button | `--type-button` / `--text-callout` | 16px |
| Technical | `--type-technical` | 13px, LTR isolate |

Weights in UI: 400, 600, 700. Don’t load extra weights without need.

Persian/Latin mixing: keep Latin product names and amounts optically even; don’t fake bold with stroke.
