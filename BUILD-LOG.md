# Token Radar — build log

Entry for make.fun `token-radar-01` — "Build the best token launch radar"
($1,325 total, 1st $1,000; entries close Mon 14 Dec 2026 17:00 WIB).
Built 2026-11-22 by a Muse subagent (parent coordinator's brief).

## What was built

A Node 22 program (`main.ts`, standard library only) that reads the sealed
DefiLlama snapshot (758 protocols, fetched 2026-11-14, floor $50M), ranks the
eligible pre-token protocols by implied value, and writes a static dashboard
plus `board.json`, `data.js` and `dossier.json`.

### The model — radar-2 (`lib/model.ts`, written from scratch)

- **Eligibility:** pre-token (no `gecko_id`, no `symbol`, no `mcap_usd`) AND
  not a wrapped/staked/bridged/exchange product. The house watchlist rule is
  applied to the whole pre-token universe, not just the $50M floor — so the
  board never mistakes a CEX, a bridge or a liquid-staking wrapper for a
  launch. 198 eligible, 144 set aside (shown apart with reasons), all 40
  watchlist slugs covered.
- **Implied value** (from the snapshot's own figures only, no name ever
  special-cased):
  `implied = TVL × category multiple × growth × maturity × breadth`
  - Category multiple: median market-cap/TVL of that category's live-token
    protocols in the snapshot itself, shrunk toward the global median (prior
    weight 8), clamped 0.05–1.00x. E.g. Risk Curators 0.48x, Dexs 0.28x,
    Lending 0.16x.
  - Growth: 1 + clamp(change_7d, −50, +150)% × 0.6.
  - Maturity: 0.55x → 1.00x over 4 years tracked (unknown age 0.78x).
  - Breadth: +7% per extra chain, up to 5.
- **Farm plans:** 5 concrete steps per protocol from category templates
  (Dexs, Lending, Yield, Risk Curators, RWA, Restaking, Derivatives, CDP,
  Payments, Chain, generic), each with cost and time. Every step 20–600 chars.
- **Dashboard** (`dashboard/`, no network, system fonts only): ranked board
  with search, category/chain/signal filters, watchlist toggle, 5 sort keys;
  detail modal per protocol with thesis, live recomputation of the implied
  value, and the 5-step farm plan; "Already trading" tab (top 24 live by
  market cap — the data the multiples are learned from); "Set aside" tab;
  "The model" tab stating the formula and every category multiple.
  Hash routing for screenshots: `#detail=<slug>`, `#cat=<category>`.

### Results

- Board: **198 rows**, ranks exactly 1–198, implied values strictly
  non-increasing, 198 distinct values, all 40 watchlist slugs present.
- Top 5: steakhouse-financial $1.27B, sentora-curator $1.10B, gauntlet
  $759.3M, polymarket-international $318.1M, veda $185.9M.
  Combined implied value $5.95B, median $3.7M.
- Dashboard source 31,549 bytes total — all of it fits in the dossier text
  cap (65,536) whole, nothing truncated.

## Tests run (all on this machine, 2026-11-22)

1. **Gate check (independent Python re-check of `out/board.json`):** 198
   rows; every slug in the snapshot; unique slugs; ranks 1–198; implied
   non-increasing; 198 distinct values; full watchlist coverage; every farm
   step 3–12 per row, 20–600 chars; no CEX/Bridge/Liquid-Staking category
   in the board. All pass.
2. **Dossier build:** `MAKEFUN_OUTPUT_DIR=out node main.ts` — clean.
   `dossier.json` 776,131 bytes (< 1.5 MiB), text 31,813 bytes, all 3
   dashboard files included whole, 3 screenshots (1440×900 PNG, 164–229 KB
   each, under the 512 KiB cap).
3. **Determinism:** two runs to separate directories are byte-identical,
   and identical to `out/`.
4. **Browser render (headless Chromium via CDP, `/tmp/tr-shot.mjs`):**
   board renders 198 rows, detail modal opens for `#detail=
   steakhouse-financial`, filter `#cat=Risk%20Curators` shows 34 rows.
   **0 console errors, 0 failed requests, 4 requests total, all `file://`.**
   Screenshots visually checked: board, detail, filtered.
5. **No-network check:** zero `http` occurrences in dashboard files.

## Bugs found and fixed

1. **Table overflow (visual):** the Chains column listed every chain, pushing
   TVL / 7d / Age / Signal / Implied value off the 1440px viewport. Fixed by
   showing the first 3 chains + "+N more" (full list in the `title` tooltip)
   and widening the content wrap to 1360px. All columns now fit.
2. **Detail modal stat boxes (CSS):** `.kv div` styled nested divs too, so
   each stat rendered as two stacked boxes (label, then value). Fixed to
   `.kv > div`.
3. **Detail breakdown label wrap:** "Base: TVL × 0.48x (Risk Curators)"
   wrapped awkwardly; shortened to "Base: TVL × 0.48x".
4. **Crash in `main.ts` log line:** referenced `radar.meta.live.length`
   (no such field) — `TypeError` on the success message after all files
   were written. Fixed to `radar.live.length`.

## Environment notes

- Headless Chromium at `/opt/meta-chromium/chrome` refuses to start without
  the Hatch WebGL domain-policy switches. The working invocation (found via
  the GTA 6 build log) uses a policy file containing exactly
  `hatch-webgl-all-origins-v1` plus its sha256, and CDP on port 9222
  (`/tmp/tr-shot.mjs` drives it; plain `--screenshot` produced no output).
- Node v24.22.1 on this machine (grader runs Node 22.23.4; `main.ts` uses
  only erasable TypeScript + stdlib, so it runs under both).

## Not done (needs the parent / user)

- **No submission, no GitHub repo, no push** — per the brief.
- `.makefun/owner.json` carries wallet
  `DUL85HUYW91grnwd3H2E9aP8TZXKDZfQhYbd3UuFQHFb` (user's linked make.fun
  wallet, verified on the profile 2026-11-22 ~05:35 WIB, per parent update).
- Transcripts/bundle are the parent's job at submit time; this build ran in
  a Muse subagent session, so the kit's bundle may treat it as handed over
  (no paid place for this bounty if so — same caveat as GTA 6).
