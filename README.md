[![make.fun](https://make.fun/badge.svg)](https://make.fun)
[![token-radar-01](https://make.fun/c/token-radar-01/badge.svg)](https://make.fun/c/token-radar-01)

# Token Radar — which pre-token protocol is worth farming next?

A radar for token launches that do not exist yet. It reads a sealed snapshot
of the protocol universe (DefiLlama, 758 protocols, fetched 2026-11-14),
finds the protocols that record no token and are not a wrapped, staked,
bridged or exchange product of a token that already trades, ranks them by
what a launch would be worth if their record stayed as it is, and shows a
reader how to farm each one.

Built for the [make.fun](https://make.fun) **token-radar-01** bounty —
*Build the best token launch radar* ($1,325, 10 paid places).

## What it does

- **The board** — 198 eligible pre-token protocols ranked by implied value,
  covering all 40 of the snapshot's watchlist protocols plus 158 early ones
  below the $50M floor. Every row carries a farm plan.
- **The model (radar-2)** — implied value is derived from the snapshot's own
  figures only, and no protocol name is ever special-cased:
  `implied = TVL × category multiple × growth × maturity × breadth`.
  The category multiple is *learned from the snapshot itself*: the median
  market-cap / TVL of that category's live-token protocols, shrunk toward
  the global median and clamped to 0.05–1.00x.
- **Set aside, shown apart** — 144 pre-token protocols are excluded from the
  ranking (CEXs, bridges, liquid-staking wrappers, versioned names) and
  listed separately with the reason, so the board never mistakes a wrapped
  product for a launch.
- **Already trading, shown apart** — the top 24 live-token protocols by
  market cap, the very data the category multiples are learned from.
- **Detail view for every protocol** — thesis, live recomputation of the
  implied value from the row's own figures, and a 5-step farm plan with
  costs and time for each step.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22.18+ (standard library only, no install, no network). `main.ts`
writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` to the output directory. It is deterministic: the same
snapshot bytes always write the same output bytes.

Then open `out/dashboard/index.html` in a browser — it renders with no
network. Try `#detail=steakhouse-financial` for a detail view, or
`#cat=Risk%20Curators` for a filtered view.

## Files

| Path | What it is |
| --- | --- |
| `main.ts` | Entrypoint: snapshot in, board + dashboard + dossier out |
| `lib/model.ts` | The radar-2 model, farm plans, board validation |
| `vendor/makefun-board.ts` | make.fun's dossier library, as shipped in the kit |
| `dashboard/index.html` | The page shell |
| `dashboard/app.css` | Dark radar-room theme, system fonts only |
| `dashboard/app.js` | Board, filters, sorting, detail view, live/set-aside/model tabs |
| `screenshots/` | Board, detail and filtered views, rendered in headless Chromium |

## Honesty notes

- “Records no token” means the snapshot records none — it is not proof a
  protocol has none.
- Implied values are this entry's model claim, not a price and not a
  prediction of whether or when any token launches. Not financial advice.

## License

MIT — see [LICENSE](LICENSE).
