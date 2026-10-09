/** Marketing / legal public-site copy (EN). Merged into messages/en.ts */
export const marketingEn = {
  skipToContent: "Skip to content",
  nav: {
    howItWorks: "How it works",
    faq: "FAQ",
    about: "About",
    signIn: "Sign in",
    createAccount: "Create account",
    menu: "Menu",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
  },
  hero: {
    h1: "Send a link. Know when they paid.",
    sub:
      "Turn a DM order into a checkout link. Your buyer pays USDT straight to your wallet. Pooli confirms it on the blockchain, so there are no screenshots and no chasing.",
    ctaPrimary: "Create your first payment link",
    ctaSecondary: "See how it works",
    demoLabel: "Demo screen. Sample data.",
  },
  builtFor: {
    line1: "Built for sellers who close sales in DMs — Instagram, Telegram and WhatsApp.",
    line2: "USDT on TRON and BNB Smart Chain.",
  },
  problem: {
    title: "You're losing time on payments you already earned.",
    p1: "Screenshots and “did you get it?” messages eat your day.",
    p2: "Buyers lose the amount, the network or the address.",
    p3: "Your orders and your payments never line up.",
  },
  steps: {
    title: "How it works",
    s1Title: "Create a payment in seconds.",
    s1Body: "Type the amount in toman.",
    s2Title: "Share the link.",
    s2Body: "Paste it in the DM.",
    s3Title: "See Paid ✓.",
    s3Body: "The buyer pays; Pooli verifies on-chain and tells you.",
  },
  draftReminders: {
    status: "IN DEVELOPMENT",
    title: "Draft reminders that write themselves.",
    sub: "Pooli drafts your payment follow-up from the job details. You review it, edit, and send. Claude writes. You decide.",
    steps: [
      "A payment goes unpaid.",
      "Claude drafts a follow-up from the job note and payment status.",
      "You review, edit, and send.",
    ],
    safety:
      "Claude never touches the payment. It drafts text. Your money flow stays deterministic and non-custodial.",
    cta: "Join the early access list",
    more: "Engineering notes",
  },
  benefits: {
    title: "What you get",
    b1Title: "Paid ✓ you can trust",
    b1Body: "Marked paid only after the blockchain confirms the exact amount.",
    b2Title: "Your wallet, your money",
    b2Body: "Funds go straight to you. Pooli never holds them.",
    b3Title: "Order details in one place",
    b3Body: "Collect name, phone and address in the checkout.",
    b4Title: "Alerts when it lands",
    b4Body: "Status in the app, plus Telegram and email.",
    b5Title: "Made for Persian sellers",
    b5Body: "Toman pricing, Persian and English, right-to-left.",
    b6Title: "Works where you sell",
    b6Body: "Buyers pay from Instagram and Telegram without installing anything.",
  },
  nonCustodial: {
    title: "Non-custodial by design.",
    body:
      "We never ask for seed phrases or private keys. Paid ✓ comes from server-side verification only. Wrong or partial payments go to review — they are never silently accepted.",
    link: "How we think about security",
  },
  earlyAccess: {
    title: "Early access.",
    body: "Pooli is new. Create an account and try it with a real order.",
    cta: "Create account",
    questions: "Questions?",
  },
  finalCta: {
    title: "Try it on a real order.",
    button: "Create your first payment link",
    sub: "No credit card. No Pooli custody.",
  },
  footer: {
    product: "Product",
    company: "Company",
    legal: "Legal",
    connect: "Connect",
    claude: "Claude at Pooli",
    howItWorks: "How it works",
    security: "Security",
    about: "About",
    contact: "Contact",
    privacy: "Privacy",
    terms: "Terms",
    builtIn: "Built in Athens, Greece.",
    rights: "All rights reserved.",
    legalDraft: "Privacy and terms are drafts pending legal review.",
  },
  imprint: {
    legalName: "Legal name",
    address: "Registered address",
    contact: "Contact",
    gemi: "GEMI no.",
    vat: "VAT no.",
    gemiPending: "Pending public disclosure",
    vatPending: "Pending public disclosure",
    founded: "Founded",
  },
  claude: {
    metaTitle: "Building with Claude",
    metaDescription:
      "How Pooli uses Claude in engineering, docs, and internal tooling. Payment verification stays deterministic Go code.",
    title: "Building with Claude",
    lead:
      "Pooli is a non-custodial payment verification platform for service businesses. We use Claude across our engineering, documentation, and internal tooling, and we're building a Claude-powered drafting layer on top of a deterministic payment core.",
    todayTitle: "How we use Claude today",
    engineeringTitle: "Engineering and code review",
    engineeringBody:
      "Claude assists with implementation, test generation, and review across our Go services and TypeScript web app.",
    docsTitle: "Documentation and policy",
    docsBody:
      "Our public site, internal runbooks, and policy drafts are written and reviewed with Claude. The privacy, terms, and security pages are drafted with Claude. A lawyer has not reviewed them yet.",
    toolingTitle: "Internal tooling",
    toolingBody:
      "Claude summarizes payment activity and assists with reconciliation checks for our own operations.",
    identityTitle: "Workload identity",
    identityBody: "Our CI authenticates to the Claude API without static keys (see below).",
    wifTitle: "Workload Identity Federation",
    wifLead:
      "Pooli authenticates to the Claude API from GitHub Actions using Workload Identity Federation. There are no static API keys in our CI.",
    wifMeans: "What that means:",
    wifPoints: [
      "GitHub Actions requests a short-lived OIDC token scoped to our repository and branch.",
      "The token is exchanged for a short-lived Anthropic access token through a federation rule.",
      "Trust is pinned to our immutable GitHub organization ID, not just the org name — so a renamed or re-registered org cannot inherit access.",
      "Tokens are single-use and expire in minutes.",
    ],
    wifClose:
      "This is production-grade keyless authentication. It means there is no long-lived secret to leak, rotate, or accidentally commit.",
    notLlmTitle: "What is not LLM-driven",
    notLlmBody:
      "Payment verification is deterministic. Matching, state transitions, and settlement checks are implemented in Go and chain workers. Claude does not decide whether a payment is valid, and it never moves money.",
    notLlmBody2:
      "We made this boundary explicit on purpose. Money conversations need high trust, and trust comes from code you can audit, not from a model you can't.",
    buildingTitle: "What we're building",
    remindersTitle: "Draft reminders",
    remindersBody:
      "A follow-up message for unpaid payments, drafted by Claude from the job note and payment status. The merchant reviews, edits, and sends. Claude drafts text; the merchant acts.",
    questionsTitle: "Payment status questions",
    questionsBody:
      "Answering customer questions like “Did I already pay?” from verified payment state, with Claude handling the language and the deterministic core handling the truth.",
    evals:
      "We build evals for payment accuracy and hallucination prevention, because a wrong answer about money is worse than no answer.",
    whyTitle: "Why Claude",
    whyBody:
      "Payment workflows need accuracy, long context, and reliable tool use. Claude fits. We also chose to build on Claude because the safety posture matches ours: bounded, auditable, human-in-the-loop where it matters.",
    builtIn: "Pooli is built in Greece.",
    program: "Applied to the Claude Startups program.",
  },
  faqLanding: {
    title: "FAQ",
    viewAll: "All questions",
    items: [
      {
        q: "Do you hold my money?",
        a: "No. Buyers pay your wallet directly. Pooli never holds seller funds or private keys.",
      },
      {
        q: "Which networks and assets?",
        a: "USDT on TRON (TRC-20) and USDT on BNB Smart Chain (BEP-20).",
      },
      {
        q: "What if the buyer pays the wrong amount?",
        a: "It is flagged for review. It is never marked paid automatically.",
      },
      {
        q: "Do I need to understand crypto?",
        a: "You need a wallet address for USDT. Pooli handles amounts, QR codes and confirmation.",
      },
      {
        q: "Does the buyer need an account?",
        a: "No. Checkout works in the browser with no install.",
      },
      {
        q: "Who is behind Pooli?",
        a: "Founded by Omid Mirzaei in Athens, Greece. See the About page for company details.",
      },
    ],
  },
  about: {
    metaTitle: "About Pooli",
    metaDescription:
      "Pooli is non-custodial USDT checkout for DM sellers. Company imprint, founder, and how we work.",
    hero: "Pooli makes getting paid from a DM feel as simple as sending a message.",
    whatTitle: "What we do",
    whatP1:
      "Pooli is a checkout link for people who sell in DMs. You quote a price in toman, share pooli.shop/p/your-link, and your buyer pays the exact USDT amount to your own wallet.",
    whatP2:
      "Pooli marks Paid ✓ only after server-side blockchain verification. Wrong amounts, wrong networks, or approximate payments never auto-settle — they land in review states you can see in the app.",
    whatP3:
      "Buyers do not need an account. Sellers sign in with email or Google, get Telegram and email alerts, and run the seller app as an installable PWA in English or Persian.",
    founderTitle: "Founder",
    founderBio:
      "Omid Mirzaei is a senior full-stack and Flutter engineer with seven years of shipping experience, focused on fintech and Web3 mobile. He has shipped wallet and payments products and is based in Athens, Greece.",
    claudeTitle: "Building with Claude",
    claudeIntro:
      "Pooli’s payment automation in production is deterministic code. We use Claude as an engineering and content assistant while we ship — with human review and a claims register before anything public goes live.",
    claudeEvals:
      "Payment correctness is validated with Go tests, chain simulation, and server-side matching — not LLM judgment.",
    claudeMore: "Read the full Claude page",
    principlesTitle: "How we build",
    principles: [
      { title: "Non-custodial", body: "Your wallet, your keys — we never hold seller funds." },
      { title: "Server-verified", body: "Only the backend can mark Paid ✓." },
      { title: "Exact-match payments", body: "Unique payable amounts per active reservation." },
      { title: "Commerce language", body: "Links and orders first — not chain jargon." },
    ],
    imprintTitle: "Company details",
    companyTitle: "Company",
    foundedLine: "Founded in 2024 in Athens, Greece.",
    fundingLine:
      "Pre-seed: USD 20,000 from friends and family to build the first product (not disclosed as revenue or GMV).",
    contactCta: "Questions? Reach us on the contact page.",
  },
  contact: {
    metaTitle: "Contact",
    metaDescription: "Email, address, and social links for Pooli support and the founder.",
    title: "Contact",
    intro: "We read every message. For partnerships and program verification, contact the founder directly.",
    primaryLabel: "Primary contact",
    supportLabel: "Support",
    founderLabel: "Founder",
    addressLabel: "Address",
    socialLabel: "Elsewhere",
  },
  faqPage: {
    metaTitle: "FAQ",
    metaDescription: "Answers about non-custodial USDT checkout, networks, buyers, and Pooli itself.",
    title: "Frequently asked questions",
    extra: [
      {
        q: "How does the USDT/toman rate work?",
        a: "When you create a payment, Pooli stores a timestamped USDT-to-toman rate and shows the buyer the exact USDT amount to pay.",
      },
      {
        q: "Can buyers pay with a wallet app?",
        a: "Yes on supported networks — QR codes and wallet handoff where available. Copying the address always works.",
      },
      {
        q: "What data do you store about buyers?",
        a: "Checkout fields you configure (name, phone, address, etc.) are stored for your order and scoped to your merchant account.",
      },
      {
        q: "Is there a merchant API?",
        a: "Not in the product UI today. Pooli is built around payment links in the seller app.",
      },
    ],
  },
  security: {
    metaTitle: "Security",
    metaDescription: "How Pooli handles non-custodial USDT checkout, verification, and disclosure.",
    title: "Security",
    intro: "Facts about how Pooli is designed. This is not a certification or a guarantee of uptime.",
    facts: [
      "Non-custodial: Pooli does not hold seller funds and never stores seed phrases or private keys.",
      "Token contracts are allowlisted per network.",
      "Payable amounts use unique integer matching per destination, network, token, and active reservation.",
      "Only server-side verification can mark a payment Paid ✓.",
      "Chain event ingest is idempotent.",
      "Customer checkout data is scoped to the owning merchant (and admin support).",
      "Public endpoints are rate-limited.",
    ],
    disclosureTitle: "Responsible disclosure",
    disclosureBody:
      "If you believe you found a security issue, email support@pooli.shop with enough detail to reproduce it. Include omid@pooli.shop as a secondary contact if support is unreachable. We aim to acknowledge new reports within 5 business days.",
  },
  privacy: {
    metaTitle: "Privacy policy",
    metaDescription: "How Pooli processes seller and buyer data.",
    title: "Privacy policy",
    draftBanner: "Draft — pending legal review",
    lastUpdated: "Last updated",
    sections: {
      controller: "Who is responsible",
      controllerBody:
        "POOLI SINGLE MEMBER P.C. (“Pooli”, “we”) is the data controller for seller account data and site operations. For buyer checkout fields, you (the seller) are the controller of your customers’ data; Pooli processes that data on your instructions to run checkout and notifications.",
      collect: "What we collect",
      collectBody:
        "Seller accounts: email, name, password hash, session cookies, wallet addresses you register, orders, payment status, notification preferences, and Telegram connection metadata when you enable it. Buyer checkout: fields you configure (for example name, phone, email, address). Payments: public blockchain transfer metadata (amounts, addresses, transaction references) needed to verify payment. Technical: server logs, rate-limit counters, and coarse product analytics events without payment addresses or buyer PII in analytics payloads.",
      analytics: "Analytics",
      analyticsBody:
        "Checkout friction analytics are privacy-oriented: event names like checkout_opened or payment_detected with coarse properties. We strip keys that look like addresses, hashes, phone, email, or names. There is no third-party ad tracker in the open-source web app; if you wire a sink via window.pooliAnalytics, that is under your deployment.",
      cookies: "Cookies",
      cookiesBody:
        "Essential cookies/local storage for login sessions, locale (pooli_locale), and theme (pooli_theme). No marketing cookie banner is required for those alone.",
      sharing: "Processors and hosting",
      sharingBody:
        "We use infrastructure and service providers needed to run Pooli (hosting, email delivery such as Resend, Telegram Bot API, blockchain RPC providers such as TronGrid for TRON). Providers process data under our instructions.",
      retention: "Retention",
      retentionBody:
        "We keep operational data while your account is active and as needed for disputes, fraud prevention, and legal obligations. Merchant-scoped buyer records can be isolated on request; export and automated deletion tooling is still being built.",
      rights: "Your rights",
      rightsBody:
        "If you are in the EU/EEA, you may have rights to access, rectify, erase, restrict, object, and port personal data, and to withdraw consent where processing is consent-based. Contact support@pooli.shop. You may lodge a complaint with the Hellenic Data Protection Authority.",
      transfers: "International transfers",
      transfersBody:
        "Data may be processed in the EU and where our hosting providers operate. We use appropriate safeguards where required by law.",
      contact: "Contact",
      contactBody: "Privacy questions: support@pooli.shop.",
    },
  },
  terms: {
    metaTitle: "Terms of service",
    metaDescription: "Terms for using Pooli.",
    title: "Terms of service",
    draftBanner: "Draft — pending legal review",
    lastUpdated: "Last updated",
    sections: {
      agreement: "Agreement",
      agreementBody:
        "By using Pooli you agree to these terms. If you do not agree, do not use the service.",
      service: "The service",
      serviceBody:
        "Pooli provides payment links and on-chain verification tools. Pooli is non-custodial: you are responsible for wallet addresses you provide and for complying with laws that apply to your sales.",
      payments: "Payments",
      paymentsBody:
        "Buyers send USDT to addresses you control. Pooli does not guarantee blockchain or RPC uptime. Mismatched payments may enter review states; Pooli does not silently accept wrong amounts.",
      acceptable: "Acceptable use",
      acceptableBody:
        "Do not use Pooli for illegal goods, fraud, money laundering, or abuse of rate-limited endpoints. We may suspend accounts that violate these rules.",
      liability: "Limitation of liability",
      liabilityBody:
        "Pooli is provided as-is to the extent permitted by law. We are not liable for indirect or consequential damages. This section is a plain-language summary and must be reviewed by counsel.",
      law: "Governing law",
      lawBody: "These terms are governed by the laws of Greece, without regard to conflict-of-law rules.",
      contact: "Contact",
      contactBody: "Legal and product questions: support@pooli.shop.",
    },
  },
};

export const marketingFa: MarketingMessages = {
  skipToContent: "رفتن به محتوا",
  nav: {
    howItWorks: "چطور کار می‌کند",
    faq: "سوالات",
    about: "درباره",
    signIn: "ورود",
    createAccount: "ساخت حساب",
    menu: "منو",
    theme: "پوسته",
    themeLight: "روشن",
    themeDark: "تیره",
    themeSystem: "سیستم",
  },
  hero: {
    h1: "لینک رو بفرست. وقتی پرداخت شد، خودت می‌فهمی.",
    sub:
      "سفارش دایرکت را تبدیل به لینک پرداخت کن. خریدار USDT را مستقیم به کیف پول تو می‌فرستد. پولی روی زنجیره تأیید می‌کند — بدون اسکرین‌شات و بدون پیگیری.",
    ctaPrimary: "اولین لینک پرداخت را بساز",
    ctaSecondary: "ببین چطور کار می‌کند",
    demoLabel: "صفحهٔ نمایشی. دادهٔ نمونه.",
  },
  builtFor: {
    line1: "برای فروشنده‌هایی که توی دایرکت می‌بندند — اینستاگرام، تلگرام و واتساپ.",
    line2: "USDT روی TRON و BNB Smart Chain.",
  },
  problem: {
    title: "روی پولی که حقش را داری، وقتت را از دست می‌دهی.",
    p1: "اسکرین‌شات و پیام «رسید؟» روزت را می‌گیرد.",
    p2: "خریدار مبلغ، شبکه یا آدرس را گم می‌کند.",
    p3: "سفارش‌ها و پرداخت‌ها هم‌خط نمی‌شوند.",
  },
  steps: {
    title: "چطور کار می‌کند",
    s1Title: "در چند ثانیه پرداخت بساز.",
    s1Body: "مبلغ را به تومان وارد کن.",
    s2Title: "لینک را بفرست.",
    s2Body: "توی دایرکت paste کن.",
    s3Title: "«پرداخت شد ✓» را ببین.",
    s3Body: "خریدار پرداخت می‌کند؛ پولی روی زنجیره چک می‌کند و به تو خبر می‌دهد.",
  },
  draftReminders: {
    status: "در حال ساخت",
    title: "پیش‌نویس یادآوری که خودش نوشته می‌شود.",
    sub: "پولی پیگیری پرداخت را از جزئیات کار پیش‌نویس می‌کند. تو می‌خوانی، ویرایش می‌کنی و می‌فرستی. Claude می‌نویسد. تو تصمیم می‌گیری.",
    steps: [
      "یک پرداخت بی‌جواب می‌ماند.",
      "Claude از یادداشت کار و وضعیت پرداخت یک پیگیری پیش‌نویس می‌کند.",
      "تو می‌خوانی، ویرایش می‌کنی و می‌فرستی.",
    ],
    safety: "Claude به خود پرداخت دست نمی‌زند. فقط متن پیش‌نویس می‌کند. پول دست پولی نمی‌ماند و مسیر پرداخت عوض نمی‌شود.",
    cta: "به فهرست دسترسی زودهنگام بپیوند",
    more: "یادداشت مهندسی",
  },
  benefits: {
    title: "چه چیزی می‌گیری",
    b1Title: "پرداخت شد ✓ قابل اعتماد",
    b1Body: "فقط بعد از تأیید مبلغ دقیق روی زنجیره «پرداخت شد» می‌خورد.",
    b2Title: "کیف پول تو، پول تو",
    b2Body: "پول مستقیم به تو می‌رود. پولی نگه نمی‌دارد.",
    b3Title: "جزئیات سفارش یک‌جا",
    b3Body: "نام، موبایل و آدرس را در checkout بگیر.",
    b4Title: "وقتی رسید، خبر می‌گیری",
    b4Body: "وضعیت در اپ، به‌علاوه تلگرام و ایمیل.",
    b5Title: "برای فروشندهٔ فارسی‌زبان",
    b5Body: "قیمت تومان، فارسی و انگلیسی، راست‌به‌چپ.",
    b6Title: "همان‌جا که می‌فروشی",
    b6Body: "خریدار بدون نصب، از اینستاگرام و تلگرام پرداخت می‌کند.",
  },
  nonCustodial: {
    title: "غیرامانی از اول طراحی شده.",
    body:
      "هرگز seed phrase یا کلید خصوصی نمی‌خواهیم. «پرداخت شد» فقط با تأیید سرور است. پرداخت اشتباه یا ناقص می‌رود برای بررسی — هرگز بی‌صدا قبول نمی‌شود.",
    link: "نگاه ما به امنیت",
  },
  earlyAccess: {
    title: "دسترسی زودهنگام.",
    body: "پولی تازه است. حساب بساز و با یک سفارش واقعی امتحان کن.",
    cta: "ساخت حساب",
    questions: "سؤال داری؟",
  },
  finalCta: {
    title: "روی یک سفارش واقعی امتحان کن.",
    button: "اولین لینک پرداخت را بساز",
    sub: "بدون کارت بانکی. بدون نگه‌داری پول توسط پولی.",
  },
  footer: {
    product: "محصول",
    company: "شرکت",
    legal: "قانونی",
    connect: "ارتباط",
    claude: "Claude در پولی",
    howItWorks: "چطور کار می‌کند",
    security: "امنیت",
    about: "درباره",
    contact: "تماس",
    privacy: "حریم خصوصی",
    terms: "شرایط",
    builtIn: "ساخته‌شده در آتن، یونان.",
    rights: "تمامی حقوق محفوظ است.",
    legalDraft: "حریم خصوصی و شرایط هنوز پیش‌نویس‌اند و بررسی حقوقی نشده‌اند.",
  },
  imprint: {
    legalName: "نام حقوقی",
    address: "آدرس ثبت‌شده",
    contact: "تماس",
    gemi: "شماره GEMI",
    vat: "شماره VAT",
    gemiPending: "در انتظار انتشار عمومی",
    vatPending: "در انتظار انتشار عمومی",
    founded: "تأسیس",
  },
  claude: {
    metaTitle: "ساختن با Claude",
    metaDescription:
      "پولی Claude را در مهندسی، سند و ابزار داخلی به‌کار می‌برد. تأیید پرداخت کد قطعی Go می‌ماند.",
    title: "ساختن با Claude",
    lead:
      "پولی یک بستر تأیید پرداخت غیرامانی برای کسب‌وکارهای خدماتی است. Claude را در مهندسی، سند و ابزار داخلی به‌کار می‌بریم، و یک لایهٔ پیش‌نویس روی هستهٔ قطعی پرداخت می‌سازیم.",
    todayTitle: "امروز Claude را چطور به‌کار می‌بریم",
    engineeringTitle: "مهندسی و بازبینی کد",
    engineeringBody:
      "Claude در پیاده‌سازی، ساخت تست و بازبینی سرویس‌های Go و وب TypeScript کمک می‌کند.",
    docsTitle: "سند و سیاست",
    docsBody:
      "سایت عمومی، ران‌بوک‌های داخلی و پیش‌نویس سیاست با Claude نوشته و بازبینی می‌شوند. صفحه‌های حریم خصوصی، شرایط و امنیت با Claude پیش‌نویس شده‌اند. وکیل هنوز آن‌ها را بررسی نکرده.",
    toolingTitle: "ابزار داخلی",
    toolingBody: "Claude فعالیت پرداخت را خلاصه می‌کند و در بررسی تطبیق عملیات خودمان کمک می‌کند.",
    identityTitle: "هویت بار کاری",
    identityBody: "CI ما بدون کلید ثابت به API کلود وصل می‌شود (پایین را ببین).",
    wifTitle: "Workload Identity Federation",
    wifLead:
      "پولی از GitHub Actions با Workload Identity Federation به API کلود وصل می‌شود. کلید API ثابت در CI نداریم.",
    wifMeans: "یعنی چه:",
    wifPoints: [
      "GitHub Actions یک توکن کوتاه‌عمر OIDC می‌گیرد که به مخزن و شاخهٔ ما محدود است.",
      "این توکن با یک قانون فدراسیون با توکن دسترسی کوتاه‌عمر Anthropic عوض می‌شود.",
      "اعتماد به شناسهٔ ثابت سازمان گیت‌هاب بسته شده، نه فقط نام سازمان — سازمانی که اسمش عوض شود یا دوباره ثبت شود دسترسی را به ارث نمی‌برد.",
      "توکن‌ها یک‌بارمصرف‌اند و ظرف چند دقیقه منقضی می‌شوند.",
    ],
    wifClose:
      "این احراز هویت بدون کلید بلندمدت است. راز طولانی‌مدتی نیست که لو برود، بچرخد، یا اشتباهی کامیت شود.",
    notLlmTitle: "چه چیز را مدل تصمیم نمی‌گیرد",
    notLlmBody:
      "تأیید پرداخت قطعی است. تطبیق، تغییر وضعیت و بررسی تسویه در Go و chain worker است. Claude تصمیم نمی‌گیرد پرداخت معتبر است یا نه، و هرگز پول جابه‌جا نمی‌کند.",
    notLlmBody2:
      "این مرز را عمداً روشن گذاشتیم. حرف از پول اعتماد می‌خواهد، و اعتماد از کدی می‌آید که می‌شود خواند، نه از مدلی که نمی‌شود.",
    buildingTitle: "چه می‌سازیم",
    remindersTitle: "پیش‌نویس یادآوری",
    remindersBody:
      "پیام پیگیری برای پرداخت‌های بی‌جواب، پیش‌نویس‌شده توسط Claude از یادداشت کار و وضعیت پرداخت. فروشنده می‌خواند، ویرایش می‌کند و می‌فرستد. Claude متن می‌نویسد؛ فروشنده عمل می‌کند.",
    questionsTitle: "سؤال از وضعیت پرداخت",
    questionsBody:
      "جواب سؤال‌هایی مثل «قبلاً پرداخت کردم؟» از وضعیت تأییدشده. Claude زبان را می‌نویسد و هستهٔ قطعی حقیقت را نگه می‌دارد.",
    evals:
      "برای دقت پرداخت و جلوگیری از جواب ساختگی eval می‌سازیم، چون جواب غلط دربارهٔ پول بدتر از بی‌جوابی است.",
    whyTitle: "چرا Claude",
    whyBody:
      "کار پرداخت دقت، زمینهٔ بلند و استفادهٔ مطمئن از ابزار می‌خواهد. Claude به این می‌خورد. موضع ایمنی‌اش هم با مال ما یکی است: محدود، قابل‌حسابرسی، و انسان در حلقه جایی که مهم است.",
    builtIn: "پولی در یونان ساخته می‌شود.",
    program: "برای برنامهٔ Claude Startups درخواست داده‌ایم.",
  },
  faqLanding: {
    title: "سوالات",
    viewAll: "همهٔ سوالات",
    items: [
      {
        q: "پول من را نگه می‌داری؟",
        a: "نه. خریدار مستقیم به کیف پول تو می‌فرستد. پولی پول فروشنده یا کلید خصوصی نگه نمی‌دارد.",
      },
      {
        q: "کدام شبکه‌ها و دارایی‌ها؟",
        a: "USDT روی TRON (TRC-20) و USDT روی BNB Smart Chain (BEP-20).",
      },
      {
        q: "اگر خریدار مبلغ اشتباه بفرستد؟",
        a: "برای بررسی علامت می‌خورد. هرگز خودکار «پرداخت شد» نمی‌شود.",
      },
      {
        q: "باید کریپتو بلد باشم؟",
        a: "یک آدرس کیف پول برای USDT لازم است. پولی مبلغ، QR و تأیید را جمع می‌کند.",
      },
      {
        q: "خریدار باید حساب بسازد؟",
        a: "نه. checkout در مرورگر بدون نصب کار می‌کند.",
      },
      {
        q: "پشت پولی کیست؟",
        a: "تأسیس‌شده توسط امید میرزایی در آتن، یونان. جزئیات شرکت در صفحهٔ درباره.",
      },
    ],
  },
  about: {
    metaTitle: "درباره پولی",
    metaDescription:
      "پولی checkout غیرامانی USDT برای فروش در دایرکت است. اطلاعات شرکت، بنیان‌گذار و نحوهٔ کار.",
    hero: "پولی جوری حس می‌شود که گرفتن پول از دایرکت مثل فرستادن یک پیام ساده باشد.",
    whatTitle: "چه کار می‌کنیم",
    whatP1:
      "پولی لینک پرداخت برای کسانی است که در دایرکت می‌فروشند. قیمت را به تومان می‌گویی، pooli.shop/p/لینک را می‌فرستی و خریدار مبلغ دقیق USDT را به کیف پول خودت می‌پردازد.",
    whatP2:
      "پولی فقط بعد از تأیید روی زنجیره «پرداخت شد ✓» می‌زند. مبلغ یا شبکهٔ اشتباه هرگز خودکار تسویه نمی‌شود — می‌رود به وضعیت‌های بررسی که در اپ می‌بینی.",
    whatP3:
      "خریدار حساب نمی‌خواهد. فروشنده با ایمیل یا گوگل وارد می‌شود، اعلان تلگرام و ایمیل می‌گیرد و اپ فروشنده را به‌صورت PWA فارسی یا انگلیسی نصب می‌کند.",
    founderTitle: "بنیان‌گذار",
    founderBio:
      "امید میرزایی مهندس ارشد فول‌استک و فلاتر با هفت سال تجربهٔ تحویل محصول است، با تمرکز روی فین‌تک و موبایل Web3. محصولات کیف پول و پرداخت تحویل داده و در آتن، یونان زندگی می‌کند.",
    claudeTitle: "ساختن با Claude",
    claudeIntro:
      "اتوماسیون پرداخت در production کد قطعی است. Claude را به‌عنوان دستیار مهندسی و محتوا به‌کار می‌بریم — با بازبینی انسانی و ثبت ادعا قبل از انتشار.",
    claudeEvals:
      "درستی پرداخت با تست Go، شبیه‌ساز زنجیره و تطبیق سرور بررسی می‌شود — نه با قضاوت LLM.",
    claudeMore: "صفحه کامل Claude",
    principlesTitle: "چطور می‌سازیم",
    principles: [
      { title: "غیرامانی", body: "کیف پول تو — پول فروشنده را نگه نمی‌داریم." },
      { title: "تأیید سرور", body: "فقط بک‌اند می‌تواند «پرداخت شد ✓» بزند." },
      { title: "مبلغ یکتا", body: "مبلغ قابل پرداخت یکتا برای هر رزرو فعال." },
      { title: "زبان فروش", body: "لینک و سفارش اول — نه اصطلاح زنجیره." },
    ],
    imprintTitle: "اطلاعات شرکت",
    companyTitle: "شرکت",
    foundedLine: "تأسیس ۲۰۲۴ در آتن، یونان.",
    fundingLine:
      "پیش‌بذر: ۲۰٬۰۰۰ دلار از دوستان و خانواده برای ساخت اولین محصول (نه درآمد یا GMV).",
    contactCta: "سؤال داری؟ از صفحهٔ تماس بنویس.",
  },
  contact: {
    metaTitle: "تماس",
    metaDescription: "ایمیل، آدرس و لینک‌های اجتماعی پشتیبانی و بنیان‌گذار.",
    title: "تماس",
    intro: "همهٔ پیام‌ها را می‌خوانیم. برای شراکت و تأیید برنامه، مستقیم به بنیان‌گذار بنویس.",
    primaryLabel: "تماس اصلی",
    supportLabel: "پشتیبانی",
    founderLabel: "بنیان‌گذار",
    addressLabel: "آدرس",
    socialLabel: "جاهای دیگر",
  },
  faqPage: {
    metaTitle: "سوالات متداول",
    metaDescription: "پاسخ درباره checkout غیرامانی USDT، شبکه‌ها، خریدار و خود پولی.",
    title: "سوالات متداول",
    extra: [
      {
        q: "نرخ USDT به تومان چطور است؟",
        a: "وقتی پرداخت می‌سازی، پولی نرخ USDT به تومان با زمان ثبت می‌کند و به خریدار مبلغ دقیق USDT را نشان می‌دهد.",
      },
      {
        q: "خریدار می‌تواند با اپ کیف پول بپردازد؟",
        a: "در شبکه‌های پشتیبانی‌شده — QR و handoff کیف پول در صورت امکان. کپی آدرس همیشه کار می‌کند.",
      },
      {
        q: "دادهٔ خریدار را چه نگه می‌داری؟",
        a: "فیلدهایی که در checkout تنظیم می‌کنی (نام، موبایل، آدرس و …) برای سفارش تو و محدود به حساب فروشندهٔ تو ذخیره می‌شود.",
      },
      {
        q: "API برای فروشنده هست؟",
        a: "در UI محصول امروز نیست. پولی حول لینک پرداخت در اپ فروشنده ساخته شده.",
      },
    ],
  },
  security: {
    metaTitle: "امنیت",
    metaDescription: "طراحی checkout غیرامانی USDT و گزارش مشکل امنیتی.",
    title: "امنیت",
    intro: "حقایق طراحی پولی. این گواهی یا تضمین uptime نیست.",
    facts: [
      "غیرامانی: پولی پول فروشنده را نگه نمی‌دارد و seed phrase یا کلید خصوصی ذخیره نمی‌کند.",
      "قرارداد توکن‌ها برای هر شبکه allowlist شده‌اند.",
      "مبالغ با تطبیق یکتا برای مقصد، شبکه، توکن و رزرو فعال.",
      "فقط تأیید سرور می‌تواند «پرداخت شد ✓» بزند.",
      "ورود رویداد زنجیره idempotent است.",
      "دادهٔ checkout مشتری محدود به فروشندهٔ مالک (و پشتیبانی ادمین) است.",
      "endpointهای عمومی rate-limit دارند.",
    ],
    disclosureTitle: "گزارش مسئولانه",
    disclosureBody:
      "اگر فکر می‌کنی مشکل امنیتی پیدا کردی، به support@pooli.shop با جزئیات کافی بنویس. در صورت نیاز omid@pooli.shop را هم بگذار. هدف ما تأیید دریافت گزارش‌های جدید ظرف ۵ روز کاری است.",
  },
  privacy: {
    metaTitle: "حریم خصوصی",
    metaDescription: "پردازش دادهٔ فروشنده و خریدار در پولی.",
    title: "حریم خصوصی",
    draftBanner: "پیش‌نویس — در انتظار بررسی حقوقی",
    lastUpdated: "آخرین به‌روزرسانی",
    sections: {
      controller: "مسئول داده",
      controllerBody:
        "POOLI SINGLE MEMBER P.C. («پولی») برای حساب فروشنده و عملیات سایت controller است. برای فیلدهای checkout خریدار، تو (فروشنده) controller دادهٔ مشتریانت هستی؛ پولی آن را برای اجرای checkout و اعلان پردازش می‌کند.",
      collect: "چه جمع می‌کنیم",
      collectBody:
        "حساب فروشنده: ایمیل، نام، hash رمز، کوکی نشست، آدرس کیف پول ثبت‌شده، سفارش‌ها، وضعیت پرداخت، تنظیمات اعلان و متادیتای اتصال تلگرام. checkout خریدار: فیلدهایی که تنظیم می‌کنی. پرداخت: متادیتای انتقال عمومی زنجیره برای تأیید. فنی: لاگ سرور، rate limit و رویدادهای تحلیل درشت بدون آدرس پرداخت یا PII خریدار در payload تحلیل.",
      analytics: "تحلیل",
      analyticsBody:
        "تحلیل اصطکاک checkout حریم‌محور است: نام رویداد مثل checkout_opened بدون آدرس یا PII. کلیدهای شبیه address، hash، phone، email یا name حذف می‌شوند. در وب اپ متن‌باز tracker تبلیغاتی third-party نیست.",
      cookies: "کوکی‌ها",
      cookiesBody:
        "کوکی/ذخیرهٔ محلی ضروری برای ورود، locale (pooli_locale) و theme (pooli_theme). برای همین‌ها بنر بازاریابی لازم نیست.",
      sharing: "میزبان و پردازشگرها",
      sharingBody:
        "زیرساخت و سرویس‌های لازم (میزبان، ایمیل مثل Resend، Telegram Bot API، RPC زنجیره مثل TronGrid برای TRON).",
      retention: "نگهداری",
      retentionBody:
        "دادهٔ عملیاتی تا فعال بودن حساب و برای اختلاف و الزامات قانونی. رکورد مشتری محدود به فروشنده؛ ابزار export/حذف خودکار در حال ساخت است.",
      rights: "حقوق تو",
      rightsBody:
        "در EU/EEA ممکن است حق دسترسی، اصلاح، حذف، محدودیت، اعتراض و انتقال داشته باشی. support@pooli.shop. شکایت به Hellenic Data Protection Authority.",
      transfers: "انتقال بین‌المللی",
      transfersBody: "داده ممکن است در EU و محل میزبان پردازش شود.",
      contact: "تماس",
      contactBody: "سؤال حریم خصوصی: support@pooli.shop.",
    },
  },
  terms: {
    metaTitle: "شرایط استفاده",
    metaDescription: "شرایط استفاده از پولی.",
    title: "شرایط استفاده",
    draftBanner: "پیش‌نویس — در انتظار بررسی حقوقی",
    lastUpdated: "آخرین به‌روزرسانی",
    sections: {
      agreement: "توافق",
      agreementBody: "با استفاده از پولی این شرایط را می‌پذیری. اگر نمی‌پذیری، استفاده نکن.",
      service: "سرویس",
      serviceBody:
        "پولی لینک پرداخت و ابزار تأیید روی زنجیره می‌دهد. غیرامانی است: مسئول آدرس کیف پول و قوانین فروشت هستی.",
      payments: "پرداخت‌ها",
      paymentsBody:
        "خریدار USDT به آدرس تحت کنترل تو می‌فرستد. uptime زنجیره یا RPC تضمین نمی‌شود. عدم تطابق می‌رود به بررسی؛ مبلغ اشتباه بی‌صدا قبول نمی‌شود.",
      acceptable: "استفادهٔ مجاز",
      acceptableBody:
        "برای کالای غیرقانونی، کلاهبرداری، پول‌شویی یا سوءاستفاده از rate limit استفاده نکن. حساب متخلف ممکن است تعلیق شود.",
      liability: "محدودیت مسئولیت",
      liabilityBody: "پولی تا حد مجاز قانون «همان‌طور که هست» ارائه می‌شود. این بخش خلاصه است و باید وکیل بررسی کند.",
      law: "قانون حاکم",
      lawBody: "قوانین یونان، بدون قواعد تضاد قوانین.",
      contact: "تماس",
      contactBody: "سؤال حقوقی و محصول: support@pooli.shop.",
    },
  },
};

export type MarketingMessages = typeof marketingEn;
