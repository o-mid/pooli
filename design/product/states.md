# States

## Empty

One human sentence + one action.

FA: «هنوز سفارشی نداری. اولین لینک پرداختت رو بساز.»

## Error

1. What happened  
2. Whether money is safe (`common.moneySafe`)  
3. What to do  

No internal error codes in merchant/buyer UI.

## Loading

Skeletons for lists (`SkeletonRows`). No decorative spinners.

## Payment

Waiting → Detected → Confirming → Paid ✓  
Technical confirmations and hashes stay behind **Payment details**.

## Reduced motion

`.rise` and sheet animations disable under `prefers-reduced-motion`.
