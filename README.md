# FishShield — Micro-insurance for artisanal fishermen

NIMASA-BEAP Hackathon 2026, **Track 11: Marine Finance & Insurance**.
Lead: Kolade Israel (Nexora Guild Boss).

Fishermen pay small weekly premiums from catch earnings and get cover for
damaged boats/nets, lost catch, and family support when injury keeps them
off the water. A cooperative dashboard manages members, premiums and claims.

## Money is DEMO / SIMULATED
Wallet top-ups and premium payments are simulated confirmations — no real
money moves, no real payment processing, no real insurer partner (underwriter:
to be confirmed — the cooperative itself).

## Structure
- `public/index.html` + `public/app.js` — fisherman app (mobile-first).
  Sign up / log in by phone number + name (no email, no OTP). Wallet with
  demo top-ups, 3 cover plans, My Policies, File a Claim (with photo),
  claim tracking, wallet history.
- `public/dashboard.html` + `public/dashboard.js` — cooperative dashboard.
  PIN-gated (demo PIN `1234`, shown on the page). Members, premiums
  collected (today/total), claims queue with approve/reject, claim photos,
  stats, recent activity.
- `public/fs-db.js` — shared data layer: plain `fetch` to the Supabase
  PostgREST API (no CDN bundle). If Supabase is unreachable it falls back
  to a localStorage store seeded with the same demo data, so the app works
  end to end offline.
- `public/styles.css` — real glassmorphism: frosted-glass panels with
  `backdrop-filter: blur()` over a dark emerald gradient.
- `supabase/0001_fs.sql` — tables `fs_fishermen`, `fs_plans`,
  `fs_policies`, `fs_wallet_tx`, `fs_claims` (RLS + grants), seeded with
  3 plans, 4 demo fishermen, 2 demo policies, 1 pending demo claim.

## Plans (weekly premium / cover limit)
- Boat & Net Cover — ₦1,500 / ₦150,000
- Catch Loss Cover — ₦1,000 / ₦80,000
- Family Support Cover — ₦800 / ₦50,000

## Verify
`verify/verify.mjs` — headless Chromium end-to-end checks (signup, top-up,
buy plan, file claim with photo, dashboard PIN + approve, overflow, glass).
