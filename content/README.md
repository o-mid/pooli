# Pooli content

Versioned marketing, messaging, and social drafts.

This tree is the **claims and copy source of truth**. Product behavior still lives in code. Visual tokens still live in [`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css). The committed brand book lives in [`design/`](../design/). Heavy renders stay in gitignored `.local-brand-studio/`.

If a sentence here disagrees with a live flag or with `globals.css`, the product wins — then update this tree.

## How to use a claim

Every public sentence must survive [`messaging/claims.md`](messaging/claims.md).

| Label | Means |
|-------|--------|
| **PROVEN** | We have first-hand evidence (live site, ops status, a documented mainnet match). Still no invented volume. |
| **IMPLEMENTED** | Code exists on this SHA. |
| **DEPLOYED** | This SHA is running on `pooli.shop`. |
| **ENABLED** | Production flag is on (`GET /api/v1/ops/status`). |
| **PLANNED** | Designed or coded, not on for customers. |
| **DO NOT CLAIM** | Missing evidence, or it would invent traction / legal / people. |

## Tree

| Path | What it is |
|------|------------|
| [messaging/positioning.md](messaging/positioning.md) | One-liners through 60s, by audience. Winners marked. |
| [messaging/messages.md](messaging/messages.md) | Category, problem, promise, proof, CTAs |
| [messaging/banned-phrases.md](messaging/banned-phrases.md) | Words we do not say |
| [messaging/claims.md](messaging/claims.md) | Feature-by-feature classification |
| [social/](social/) | Account setup + publishable drafts |
| [media-kit/](media-kit/) | Press kit with honest placeholders |
| [decks/](decks/) | Slide source (binaries in `.local-brand-studio/pitch/`) |
| [reviews/rubric.md](reviews/rubric.md) | Independent critique hats |
| [visuals/](visuals/) | Inventory of studio + new renders (binaries stay gitignored) |

## Product in one breath

Send a link. Know when they paid.

Seller quotes in toman. Buyer pays exact USDT to the seller’s wallet. Pooli never holds the money. The seller sees **Paid ✓**.

## What this tree will not do

- Invent merchants, GMV, testimonials, investors, or a legal entity
- Lead with chain names when the job is “send the link”
- Treat Notion Product OS as live behavior
- Publish to any network from this repo
