# Information architecture

## Before

Bottom tabs: Home · Orders · **New** · Customers · Settings  
Wallets and reusable links buried in a long Settings page. Home was a wall of stats including USDT and 7-day analytics.

## After

Bottom tabs (destinations only):

- **Home** `/app` — Did I get paid today?
- **Orders** `/app/orders` — The working list
- **Customers** `/app/customers`
- **Settings** `/app/settings` — landing of groups

**New payment** is an action: Home hero, Orders `+`, customer detail, desktop chrome.

Settings child pages:

- Store
- Getting paid → wallets, reusable links, what to ask buyers
- Notifications
- App & language
- Account (logout / admin)

Onboarding: store name → payout address → first payment. No ceremonial ready step.

Dark theme: `[data-theme="dark"]` tokens in `globals.css`. Appearance lives under Settings.


One commerce object: order/payment by context. `payment_intent` stays internal.
