# LinkedIn launch checklist — Pooli

Do not publish until metadata is honest (company size, location, industry). Re-fetch ops the morning you post.

```bash
curl -s https://pooli.shop/api/v1/ops/status | jq '.ok, .config.instagram_enabled'
```

## Banners (exported)

| Surface | File | Size |
|---------|------|------|
| Company page | `.local-brand-studio/social/banners/linkedin-company-banner.png` | 1128×191 |
| Personal profile | `.local-brand-studio/social/banners/linkedin-personal-banner.png` | 1584×396 |

Source HTML (re-export): `.local-brand-studio/social/linkedin/company-banner.html` (studio.css + app UI). Personal: `banners/linkedin-personal.html`

```bash
open .local-brand-studio/social/banners/linkedin-company-banner.png
```

**Company:** Edit Page → Page info → Upload banner.  
**Personal:** Profile → background photo → Upload.

---

## Company page (admin)

- [ ] **Metadata fixes:** size → 1 employee; industry → Computer Software; location → one true city (Athens *or* UAE — match personal profile)
- [ ] **Banner:** upload `linkedin-company-banner.png`
- [ ] **Custom button:** Edit Page → Button → Visit website → `https://pooli.shop`
- [ ] **First post LC-01** (text below)
- [ ] **Pin LC-01** after a second post exists (pair with LC-03 later)

### LC-01 — copy/paste

```
Checkout for people who sell in DMs.

Create a payment, share a link, see Paid ✓. The money goes to the seller’s wallet. We never hold it.

Not a wallet. Not an exchange. A page you send instead of “please send the receipt.”

The homepage says it shorter: Send a link. Know when they paid. We didn’t write a smarter line for this page.

We are a small team. The site is live. We will not post a customer count we haven’t published.

pooli.shop
```

Visual: live homepage screenshot or `.local-brand-studio/social/instagram/posts/en/01-intro.png` if exported.

---

## Personal profile (same day)

- [ ] **Headline:** `Building Pooli — checkout for people who sell in DMs`
- [ ] **Experience:** Founder @ Pooli (link company page), start date = when you started building Pooli
- [ ] **Banner:** upload `linkedin-personal-banner.png`
- [ ] **Featured:** Add link `https://pooli.shop` + one labeled product screenshot
- [ ] **First post LF-01** (see `launch-sequence.md` Day 1) — stagger a few hours after LC-01
- [ ] **Notify network:** OFF on profile edits unless intentional launch day

### GitHub Education + Azure (profile fields)

Full copy-paste and skill lists: **[linkedin-education-azure.md](linkedin-education-azure.md)**.

- [ ] **Featured:** add `https://github.com/o-mid/pooli` and `https://o-mid.com` (titles in that doc)
- [ ] **Skills:** reorder top 5 for founder launch *or* job search (lists in that doc)
- [ ] **About:** optional paragraph blending Pooli + senior engineering (in that doc)
- [ ] **Microsoft Learn:** finish at least one module → **Add to profile** from Learn (not from Azure credit page)
- [ ] **GitHub Foundations:** redeem Pack exam voucher → pass → **Licenses & certifications**
- [ ] **Azure $100:** budget alerts only; use staging/diagrams for post visuals — do not claim Azure certs without exams

---

## Verify personal profile with Pooli email

### Which addresses work

| Address | Receive mail? | Use for LinkedIn? |
|---------|---------------|-------------------|
| `support@pooli.shop` | Yes (human inbox on pooli.shop MX) | **Yes** — best default |
| `omid@pooli.shop` / `hello@pooli.shop` | Yes, if you create the mailbox | **Yes** — cleaner for founder |
| `omidomirzaei@gmail.com` | Yes | OK — keep as login; optional secondary |
| `notifications@notify.pooli.shop` | **No** (Resend outbound only) | **Do not use** |

### Steps (personal)

1. Log into the **pooli.shop mailbox** (Hostinger hPanel → Emails, or your mail client).
2. LinkedIn → **Me** → **Settings & Privacy** → **Sign in & security** → **Email addresses**.
3. **Add email** → enter `support@pooli.shop` or `omid@pooli.shop`.
4. Open the verification email from LinkedIn in that inbox → **Confirm**.
5. Optional: set the `@pooli.shop` address as **Primary** for public contact (keep Gmail for login if you prefer).

### Steps (show you work at Pooli)

1. **Experience** → Founder @ **Pooli** → link the company page (not Palete).
2. Verified `@pooli.shop` on profile supports trust; LinkedIn may still ask for extra verification separately.
3. Do **not** claim Instagram checkout or traction in headline/About.

### If verification email never arrives

- Check spam in the pooli.shop mailbox.
- Confirm MX for `pooli.shop` in Hostinger (support mailbox exists).
- Do not use `notify.pooli.shop` — that subdomain is for Resend sending only.

---

## Order of operations (one session)

1. Fix company metadata + upload company banner + website button  
2. Add & verify `@pooli.shop` email on personal profile  
3. Update personal headline, Experience, banner, Featured  
4. Post **LC-01** on company page  
5. Post **LF-01** on personal profile (same day, later)  
6. Pin LC-01 when LinkedIn allows (after post #2)

Palete Design House: leave quiet. Do not cross-post Pooli there.
