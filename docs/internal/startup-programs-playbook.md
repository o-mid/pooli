# Startup programs playbook — Anthropic Claude Startups & OpenAI

**Owner:** Omid / Pooli  
**Last updated:** 2026-10-17  
**Status:** Internal — do not publish claims from this doc until shipped and lawyer-reviewed where noted.

---

## 0. Reality check (read first)

| Myth | Truth |
|------|--------|
| “We can get 100% acceptance” | **No.** Both programs use **sole discretion**, high volume, and (for Anthropic Oct 2026) **cohort caps**. Many eligible startups are rejected in minutes. |
| “OpenAI startup program = apply on openai.com” | **API credits** are almost always **VC referral + code**, not a public form. |
| “We are an AI startup because we use Cursor” | Reviewers score **product integration** with **their** API and production path, not dev tooling alone. |
| “Payment AI” | Pooli’s moat is **deterministic money truth**. LLMs are for **language + agents**, never `PAID`. |

**Pooli eligibility (Anthropic):** Likely **yes** — company in Greece (GEMI), founded 2024, friends & family funding stated on site → “funded in last 2 years” + founded &lt; 5 years.

**Timing (Anthropic):** As of **2026-10-13**, [Claude Startups cohort is full](https://claude.com/programs/startups). Subscribe to the **Claude Startup newsletter**; prepare now, apply on next open window.

---

## 0.1 Application history (Pooli → Anthropic)

| # | When | Email | Company on form | Outcome | Lesson |
|---|------|-------|-----------------|--------|--------|
| **1** | First apply | `support@pooli.shop` | “Pooli.shop” (domain) | **Rejected** (standard eligibility/verify template) | Generic inbox + no legal entity + vague Claude use → looks unverifiable |
| **2** | Reapply | `omid@pooli.shop` | **POOLI SINGLE MEMBER P.C.** | **Rejected** (or closed with cohort pause ~Oct 9–13 2026) | Better identity; **“what you build” overclaimed** (Stripe, accounting, note→invoice) — does not match pooli.shop / GitHub |
| **3** | Next window | `omid@pooli.shop` only | Legal name + Console org **Pooli** | Pending | Use **§4.6** copy only; ship **§5 P0** before apply if possible |

**Do not reuse application #2 Claude paragraph.** Reviewers can open the site and see USDT / non-custodial / no Stripe — that reads as misrepresentation or bot-generated fluff.

**Email to `startups@anthropic.com`:** Not a listed Claude Startups support path; low response odds during pause. If you send once, use **§4.7** (factual, short). Prefer Console reapply + newsletter when cohort reopens.

---

## 1. Anthropic — Claude Startups

### 1.1 Official requirements

| Requirement | Pooli |
|-------------|--------|
| Founded in last **5 years** OR funded in last **2 years** | ✓ (2024, F&amp;F on About) |
| **Claude Console** account | Create under **Pooli org**, not personal |
| **Company email** matching website domain | Use `omid@pooli.shop` or `founder@pooli.shop` — **not** Gmail for application |
| Brief description of what you’re building | See §4 copy bank |
| Comply with **supportability / usage policies** | No sanctioned use; fintech OK if truthful |
| Application complete | Anthropic may disqualify incomplete apps |

**Benefits (typical approved package):**

- ~**$1,000** first-party **API credits** (Console; **not** AWS/GCP/Azure Bedrock)
- **1 year Claude Team** (up to 5 Premium seats) if **new to Team**
- **Startup Stack** partner offers (up to ~$45k listed value)
- Optional **up to $100k** API credits if backed by **Anthropic partner VC** (separate path)

**Official evaluation factors** ([Startup Program Terms](https://www.anthropic.com/startup-program-official-terms)):

- Business traction, investment, funding  
- **Claude integration and usage** ← Pooli’s weakest official signal today  
- Sole discretion — final

### 1.2 Community / rejection intelligence (not official)

Sources: [BuildnWrite aggregation](https://buildnwrite.io/blog/claude-startups-program/), Threads/Reddit Oct 2026, founder posts.

| Pattern | Implication |
|---------|-------------|
| Rejection in **minutes** | Often **automated** screen (eligibility + verify company + vague answers) |
| **Gmail** applicant email | Frequently rejected; domain email is mandatory |
| **Generic** “we’re building an AI app” | Filtered; resubmit with **stack, ICP, workflows, token budget** ([example](https://www.linkedin.com/posts/anupamj_rejected-claude-stream-activity-7514085160045330432-oZIh)) |
| **Website not verifiable** (age, sparse footprint) | Some founders report rejections until site + domain look “real” |
| **Cohort full** | Pending apps **mass-declined** even if qualified (Oct 2026) |
| Approvals with **no revenue**, solo founder, bootstrapped | Possible — not deterministic |

**Not proven:** reapply loops always work; Anthropic does not publish reasons.

### 1.3 If Anthropic rejects you — full review protocol

Do this **within 48 hours** while answers are fresh.

1. **Classify rejection**
   - Instant email → assume auto screen (eligibility, verify, vagueness, capacity).
   - After 2–3 days → manual review “no” or capacity.

2. **Evidence pack** (private doc)
   - Exact form answers (screenshot).
   - Console org ID, email used, domain WHOIS, site pages live.
   - Any API usage graph (even $5 spend).

3. **Gap analysis** (use §3 scorecard)

4. **Wait for next cohort** OR fix blockers and reapply when open (do not spam daily).

5. **Optional escalation** (low yield)
   - Applied AI events / Founder House / newsletter — human network, not support ticket.
   - `learn@github.com` is **GitHub certs**, not Claude Startups — use Console help / program FAQ contacts only if listed.

6. **Parallel paths**
   - **Partner VC** route for extra $100k if you raise from Anthropic network.
   - Keep paying for API at small scale to show real integration before reapply.

---

## 2. OpenAI — startup API credits

### 2.1 Official requirements ([OpenAI Startups FAQ](https://openai.com/business/why-openai/startups/))

| Item | Notes |
|------|--------|
| **VC partner referral code** | Primary path to API credits |
| Named partner examples | Thrive, Sequoia, a16z, Kleiner Perkins, Conviction (list changes) |
| **OpenAI org ID** | Platform → Settings → Organization |
| **Business email** | Match company domain |
| Product description + **how you will use API** | Specific workflows |
| Basic funding details | Stage, amount band |
| Billing on account | Often required before credits (see Norwest PDF) |
| **No pitch deck** | Short form |

**Typical credit size (partner-dependent, not officially published):** often cited ~**$5k–$10k** per tranche (e.g. Norwest $10k PDF).

**Restrictions (example Norwest):** not **Series B+**; credits **API only** (not ChatGPT consumer); one org; may top-up prior grants.

### 2.2 What is *not* API credits

| Program | What you get |
|---------|----------------|
| [OpenAI Startup Community lead form](https://openai.com/leads/startup/) | Events, resources — **not** automatic credits |
| **OpenAI Grove** cohort | Direct application; **Cohort 2 closed Jan 2026** — watch for reopen |
| **Microsoft for Startups** | Azure $100; **not** a substitute for OpenAI credits |

### 2.3 Community / rejection intelligence

| Issue | Result |
|-------|--------|
| No partner VC / wrong referral code | Denied or invalid code |
| Personal email | Weak trust |
| Vague “AI features” | Manual reject |
| “AI on website” only, no API integration | Weak ([reddit anecdote](https://www.reddit.com/r/startups/comments/1d7yyil/openai_startups_program/)) |
| Applied via wrong program (e.g. old MS bundle) | Ghosted / wrong queue |

### 2.4 If OpenAI rejects you — full review protocol

1. Confirm **investor is in partner network** — if not, **credits path does not exist** until you get a qualifying intro/code.
2. Ask VC platform team for **current** referral code (codes expire).
3. Verify **org ID** matches email on form.
4. Email **startups@openai.com** only for **partner portfolio** escalations (per Norwest doc); include org ID, code used, date applied.
5. **Product path:** document OpenAI API usage plan even if credits pending (see §5).

**Pooli today:** F&amp;F is **not** an OpenAI partner VC → **do not expect OpenAI API credits** without a new investor relationship or Grove-style cohort.

---

## 3. Pooli scorecard vs what reviewers want

| Signal | Anthropic weight | OpenAI weight | Pooli today (honest) | Target |
|--------|------------------|---------------|----------------------|--------|
| Live product + domain | High | High | ✓ pooli.shop, GEMI | Keep ops honest (BSC watcher) |
| `@pooli.shop` email | High | High | ✓ | Use for all applications |
| **Claude API in production path** | **Very high** | — | ✗ (`productUsesClaude: false`; gateway has **no** Anthropic SDK) | **Ship §5.1** |
| **OpenAI API in production path** | — | **Very high** | ✗ | **Ship §5.2** or partner route only |
| MCP / agents | High (Anthropic narrative) | Medium | ✓ action-gateway, evals | Demo video + public docs |
| Keyless CI → Anthropic | Medium | — | ✓ WIF workflow | Link on `/claude` |
| Evals / safety story | High | High | ✓ 30+ deterministic gateway cases | Add LLM draft evals optional |
| “AI decides payment” | Disqualifying if claimed | Same | ✓ correctly denied | Never market LLM paid |
| Traction metrics | Medium | Medium | Early / no public GMV | Honest “live, early access” |
| `/claude` page | Medium | Low | ✓ strong narrative | Fix “Applied” vs aspirational copy |

**Critical honesty gap:** Marketing (`draftReminders`, `/claude` “What we’re building”) describes **Claude-drafted buyer messages**; **product does not call Claude yet** — agents supply text via MCP. Reviewers who click through may see **overclaim**.

---

## 4. Application copy bank (customize per form)

Use **`omid@pooli.shop`** (founder). Console organization name should match **POOLI SINGLE MEMBER P.C.** or **Pooli**, not `pooli.shop` alone.

### 4.1 One-liner (product — not “AI invoicing”)

> Pooli is **non-custodial USDT checkout** for sellers who close orders in **Instagram and Telegram DMs**: the seller shares a payment link; the buyer pays **USDT to the seller’s own wallet**; Pooli marks **Paid ✓** only after **on-chain verification** in Go — we never hold funds.

### 4.2 Short company blurb (fintech / SaaS fields)

> **Legal entity:** POOLI SINGLE MEMBER P.C. (Athens, Greece). **Founded:** 2024. **Funding:** ~$20k friends & family (pre-seed). **Product:** Live at https://pooli.shop — merchant PWA, public checkout, Telegram bot, MCP action gateway for agent integrations. **Not:** custodial wallet, Stripe card processing, or LLM-decided payment status.

### 4.3 What we build with Claude — **WRONG (application #2 — do not repeat)**

~~“AI payment workflow… invoices from notes… Stripe, email/SMS, accounting tool calling…”~~ — **Inaccurate for Pooli.** Likely hurts verification.

### 4.4 What we build with Claude — **application #3 (honest, today)**

Paste into “What are you building on Claude?” (≈1200 chars max if limited; trim paragraphs as needed):

> **Company:** POOLI SINGLE MEMBER P.C. (Greece), https://pooli.shop  
>  
> **Product:** Pooli is non-custodial checkout for DM sellers. Merchants create a USDT payment link; buyers pay the merchant’s TRON/BSC wallet; **Paid ✓** is set only by our Go API and chain worker after amount match — not by any model.  
>  
> **How we use Claude today:** (1) **Engineering** — API design, tests, and reviews across Go + Next.js. (2) **Docs and bilingual (EN/FA) marketing**, checked against our claims register. (3) **Agent gateway (MCP)** — external agents (including Claude) call read-only snapshots and **propose** buyer follow-up text; a **server-side linter** blocks false “paid” claims; **30+ deterministic eval cases** in CI (`make evals`). Merchants approve via in-app + Telegram before anything sends. (4) **CI authentication** to Anthropic via **GitHub OIDC → Workload Identity Federation** (documented at https://pooli.shop/claude).  
>  
> **What we are shipping next with Claude API:** first-party **“Suggest follow-up”** drafts from order snapshots (same linter + human confirm).  
>  
> **Why we need startup API credits:** production drafting volume, EN/FA eval regression, and Applied AI sessions as we harden payment-adjacent language. **~41–60%** of our AI spend is already Anthropic (Console + dev tooling).

### 4.5 What we build with Claude — **application #3 (after §5.1 P0 ships)**

> Same as §4.4, but replace the “shipping next” sentence with: **“In production:** merchants tap **Suggest follow-up**; Pooli calls **Claude Messages API** with structured snapshots; outputs must pass the false-paid linter and eval suite before review.”

### 4.6 Form field cheat sheet (application #3)

| Field | Value |
|-------|--------|
| Email | `omid@pooli.shop` |
| First / Last | Omid Mirzaei |
| Job title | Founder & CEO |
| Company name | **POOLI SINGLE MEMBER P.C.** |
| Website | https://pooli.shop |
| Organization (Console) | Pooli (create if missing) |
| Country / City | Greece / Athens |
| Industry | Financial Technology / Payments SaaS |
| Founded | 2024 (month you registered IKE if asked) |
| Funding | Pre-seed; **Yes** outside funding; **~$20k** friends & family |
| Support wanted | API credits, Applied AI office hours, founder community |
| % spend on Anthropic | 41–60% **only if true** from Console billing; else pick accurate band |
| LinkedIn | https://www.linkedin.com/in/omid-mirzaei/ |
| GitHub (if free text) | https://github.com/o-mid/pooli |

### 4.7 Email (optional — one send only; not a substitute for reapply)

**To:** only use if Anthropic lists a startup contact; `startups@anthropic.com` is **unverified** for Claude Startups.  
**From:** `omid@pooli.shop`  
**Subject:** Claude Startups — Pooli (POOLI SINGLE MEMBER P.C.) — building on Claude API + MCP

**Body:**

> Hi Anthropic Startups team,  
>  
> I’m Omid Mirzaei, Founder & CEO of **POOLI SINGLE MEMBER P.C.** (Athens, Greece). We applied to Claude Startups twice; the first was correctly weak (support@ email, vague description). The second used better company details but overstated our product (Stripe/invoicing) — that does not match our live site.  
>  
> **What Pooli actually is:** non-custodial **USDT checkout** for sellers in DMs (https://pooli.shop). Payment truth is **deterministic Go + chain verification**; Claude is for **engineering, bilingual content, and agent-proposed buyer messages** through our **MCP action gateway**, with a false-paid linter and **30+ eval cases** in CI. Details: https://pooli.shop/claude  
>  
> **Entity:** POOLI SINGLE MEMBER P.C., Porou 31, Athens; VAT EL984396884 (if accurate on your records). Founded 2024; ~$20k friends & family pre-seed.  
>  
> We’re requesting **API credits** and **Applied AI** guidance as we ship first-party Claude drafting on the same safety path. Happy to share Console org ID and a short demo on request.  
>  
> Thank you,  
> Omid Mirzaei  
> omid@pooli.shop  

*(Confirm VAT on GEMI certificate before sending.)*

### 4.8 OpenAI API use (if partner code obtained)

> Same architecture with **provider abstraction** at the gateway: structured snapshot in, draft out, linter + evals, human confirm. OpenAI models for **A/B eval** and **Farsi/English** phrasing tests. Payment state never from LLM.

### 4.9 ICP (be specific)

> **Who pays:** solo and small-team DM sellers (fashion, electronics, services) in MENA + diaspora. **Workflow:** quote in chat → Pooli link → USDT to seller wallet → Paid ✓ in seller PWA. **Pain:** screenshot receipt chase.

### 4.10 Traction (honest)

> Production on pooli.shop (TRON mainnet). Telegram bot enabled. Early access; no published GMV. Friends & family pre-seed. Athens-registered company (GEMI).

### 4.11 Compute / token ask

> Estimated **$X/mo** API: ~N drafts/day × ~2k tokens, plus weekly eval batches. Current spend $Y/mo personal Console (fill real numbers before submit).

---

## 5. Product & engineering — what to add (priority)

### P0 — Before next Anthropic application window

1. **First-party Claude draft service** (`apps/action-gateway` or `apps/api`)
   - Endpoint or MCP tool: `suggest_buyer_message_from_snapshot` → calls Anthropic Messages API.
   - Input: same fields as `get_order_snapshot` (no PII beyond what merchant already collects).
   - Output: proposed text → existing `propose_buyer_message` pipeline + linter.
   - Feature flag: `ANTHROPIC_API_KEY` or WIF in prod.
   - Merchant UI: “Suggest follow-up (Claude)” on order detail.

2. **Set `productUsesClaude: true`** in `site.ts` only when (1) is live in prod.

3. **Console hygiene**
   - Org: Pooli P.C.
   - Pay-as-you-go with **real usage** (smoke tests, staging) — shows graph before apply.
   - Applicant: `omid@pooli.shop`.

4. **Claims register**
   - Align `/claude`, landing `draftReminders`, and `marketing-content.ts` with shipped behavior.
   - Remove “Applied to Claude Startups” until submitted; then “Member since …” or remove.

5. **Demo artifact**
   - 2–3 min screen recording: Claude Desktop or Cursor agent → MCP → propose → merchant confirm (no buyer auto-send).

### P1 — Strengthen both programs

6. **Provider interface** for draft generation (`ClaudeDraftProvider`, `OpenAIDraftProvider`) — same linter/evals.

7. **LLM eval package** (optional): golden drafts per `payment_status` × locale; regression in CI with API key in secrets.

8. **Public `/claude` “Integration” section**: link to `docs/agent-integration.md`, eval count, WIF diagram.

9. **Website verification**
   - About + GEMI + founder + GitHub + consistent `pooli.shop` MX.
   - `/humans.txt`, `/llms.txt` already exist — keep updated.

### P2 — OpenAI credits path (non-product)

10. **Investor map**: which angels/accelerators are OpenAI partners; ask for referral at next close.

11. **OpenAI Startup Community** form — org ID — for events while waiting on credits.

12. **Do not** claim OpenAI credits on site until granted.

### P3 — Nice for reviewers

13. Architecture diagram (ToDiagram) on `/claude` or docs.

14. Metrics in ops (drafts suggested / approval rate) — no customer PII in metrics.

---

## 6. Pre-flight checklist (day of apply)

### Anthropic

- [ ] Applications **open** (newsletter confirmed)
- [ ] Logged into Console as **@pooli.shop**
- [ ] Company URL https://pooli.shop loads; `/claude` accurate
- [ ] Claude API usage &gt; $0 in last 14 days
- [ ] P0 draft feature **live** or honest copy in form
- [ ] Answers pasted from §4 (specific, numbers filled)
- [ ] Screenshot answers saved
- [ ] BSC/TRON claims match `ops/status`

### OpenAI (partner path only)

- [ ] Referral code from partner VC
- [ ] Billing enabled on platform account
- [ ] Org ID copied
- [ ] §4.3 + funding stage filled
- [ ] Provider draft path shipped or OpenAI named in eval plan

---

## 7. References

- [Claude Startups](https://claude.com/programs/startups)
- [Anthropic Startup Program Terms](https://www.anthropic.com/startup-program-official-terms)
- [Anthropic certifications / student voucher FAQ](https://learn.github.com/certifications)
- [OpenAI Startups](https://openai.com/business/why-openai/startups/)
- [OpenAI Startup Community](https://openai.com/leads/startup/)
- Pooli: `docs/agent-integration.md`, `apps/action-gateway/README.md`, `evals/dataset/cases.yaml`, `/claude` page

---

## 8. Decision log

| Date | Decision |
|------|----------|
| 2026-10-17 | Playbook created; **do not apply Anthropic until cohort reopens**; **ship P0 Claude draft** before claiming product AI on forms. |
| 2026-10-17 | Logged applications #1–#2; **retire #2 Claude paragraph**; use §4.4–4.7 for #3. |
| | OpenAI credits: **VC referral required** unless Grove reopens. |
