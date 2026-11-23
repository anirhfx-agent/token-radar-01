// Token Radar's model, radar-2: one sealed snapshot in, one ranked board out.
//
// The board ranks only protocols that record no token AND are not a wrapped, staked,
// bridged or exchange product of a token that already trades. The house watchlist
// rule (input/README.md) is applied to the whole pre-token universe, not just the
// $50M floor: a CEX, a bridge or a liquid-staking wrapper is not a launch a reader
// can farm, however big its TVL, so those protocols are set aside and shown apart
// instead of ranked. Every watchlist slug is on the board; the board adds the
// eligible protocols below the floor, the early ones the radar exists to find.
//
// Implied value is derived from the snapshot's own figures only. No protocol name
// is ever special-cased; the same function scores every row:
//
//   catMultiple  = the market multiple of the protocol's category, learned from
//                  the snapshot's own live-token protocols: the median market-cap
//                  to TVL ratio of that category, shrunk toward the global median
//                  (prior weight 8) and clamped to [0.05, 1.00]. A category with
//                  one live protocol barely moves the global figure.
//   base         = tvl_usd x catMultiple
//   growthMult   = 1 + clamp(change_7d, -50, 150) / 100 x 0.6
//   maturityMult = 0.55 + 0.45 x min(age_days, 1460) / 1460 (age unknown: 0.775)
//   breadthMult  = 1 + 0.07 x min(chains - 1, 5)
//   implied      = max(1, round(base x growthMult x maturityMult x breadthMult))
//
// Age is listed_at to the snapshot's as_of day. The dashboard recomputes the same
// arithmetic from the row's own figures, so the page and board.json always agree.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export const MODEL_VERSION = 'radar-2';
export const GROWTH_WEIGHT = 0.6;
export const GROWTH_FLOOR = -50;
export const GROWTH_CAP = 150;
export const MATURITY_FLOOR = 0.55;
export const MATURITY_RANGE = 0.45;
export const MATURITY_DAYS = 1460;
export const UNKNOWN_AGE_MULT = 0.775;
export const BREADTH_PER_CHAIN = 0.07;
export const BREADTH_MAX_CHAINS = 5;
export const MULT_PRIOR_WEIGHT = 8;
export const MULT_MIN = 0.05;
export const MULT_MAX = 1.0;
export const LIVE_ROWS = 24;
export const EXCLUDED_TOP = 12;

/** Categories the radar sets aside: a token here already trades, or the product
 *  is a wrapped, staked or bridged form of one that does. */
export const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** Exchange names a protocol name must not begin with. */
export const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Why a pre-token protocol is set aside instead of ranked. Null means eligible. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
    return `category ${p.category}`;
  }
  if (VERSION_MARKER.test(p.name)) return 'versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked name';
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return 'exchange name';
  }
  return null;
}

/** True when the snapshot records no token for the protocol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const listed = Date.parse(`${listedAt}T00:00:00Z`);
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(listed) || !Number.isFinite(asOfMs)) return null;
  return Math.max(0, Math.round((asOfMs - listed) / 86_400_000));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The market multiple per category, learned from the snapshot's own live-token
 * protocols: median market-cap / TVL of the category, shrunk toward the global
 * median with a prior weight, then clamped. Categories with no live protocol
 * take the global median.
 */
export function categoryMultiples(protocols: SnapshotProtocol[]): {
  global: number;
  byCategory: Record<string, number>;
} {
  const live = protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0,
  );
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const global = ratios.length > 0 ? median(ratios) : 0.2;
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const list = byCat.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(key, list);
  }
  const byCategory: Record<string, number> = {};
  for (const [cat, list] of byCat) {
    const shrunk =
      (list.length * median(list) + MULT_PRIOR_WEIGHT * global) /
      (list.length + MULT_PRIOR_WEIGHT);
    byCategory[cat] = Math.min(MULT_MAX, Math.max(MULT_MIN, shrunk));
  }
  return { global, byCategory };
}

export interface ModelBreakdown {
  cat_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  base_usd: number;
}

export function scoreProtocol(
  p: SnapshotProtocol,
  multiples: { global: number; byCategory: Record<string, number> },
  asOf: string,
): { implied: number; age: number | null; model: ModelBreakdown } {
  const catMultiple =
    multiples.byCategory[p.category ?? 'Uncategorised'] ?? multiples.global;
  const growth = Math.min(
    GROWTH_CAP,
    Math.max(GROWTH_FLOOR, p.change_7d ?? 0),
  );
  const growthMult = 1 + (growth / 100) * GROWTH_WEIGHT;
  const age = ageDays(p.listed_at, asOf);
  const maturityMult =
    age === null
      ? UNKNOWN_AGE_MULT
      : MATURITY_FLOOR +
        (Math.min(Math.max(age, 0), MATURITY_DAYS) / MATURITY_DAYS) *
          MATURITY_RANGE;
  const breadthMult =
    1 + BREADTH_PER_CHAIN * Math.min(Math.max(p.chains.length - 1, 0), BREADTH_MAX_CHAINS);
  const base = p.tvl_usd * catMultiple;
  const implied = Math.max(
    1,
    Math.round(base * growthMult * maturityMult * breadthMult),
  );
  return {
    implied,
    age,
    model: {
      cat_multiple: Math.round(catMultiple * 10000) / 10000,
      growth_multiplier: Math.round(growthMult * 10000) / 10000,
      maturity_multiplier: Math.round(maturityMult * 10000) / 10000,
      breadth_multiplier: Math.round(breadthMult * 10000) / 10000,
      base_usd: Math.round(base),
    },
  };
}

/** A one-word read on the row, from its growth and age only. */
export function signalOf(p: SnapshotProtocol, age: number | null): string {
  const g = p.change_7d ?? 0;
  if (g >= 10 && age !== null && age < 180) return 'New & rising';
  if (g >= 10) return 'Heating up';
  if (g <= -10) return 'Cooling';
  if (age !== null && age >= 730) return 'Seasoned';
  if (age !== null && age < 90) return 'Early';
  return 'Steady';
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/** One sentence saying why the row ranks where it does, from its own figures. */
export function thesisOf(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
): string {
  const growth =
    p.change_7d === null
      ? 'with no 7-day change reported'
      : p.change_7d >= 0
        ? `up ${p.change_7d.toFixed(1)}% over 7 days`
        : `down ${Math.abs(p.change_7d).toFixed(1)}% over 7 days`;
  const ageText =
    age === null
      ? 'tracked for an unknown length of time'
      : age >= 365
        ? `tracked for ${(age / 365).toFixed(1)} years`
        : `tracked for ${age} days`;
  return (
    `Holds ${fmtMoney(p.tvl_usd)} of TVL across ${p.chains.length} ` +
    `${p.chains.length === 1 ? 'chain' : 'chains'}, ${growth}, ${ageText}, and records no token. ` +
    `At its category's market multiple its launch would be worth about ${fmtMoney(implied)}.`
  );
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  token_status: 'pre-token';
  on_watchlist: boolean;
  signal: string;
  thesis: string;
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  symbol: string;
}

export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

export interface RadarData {
  meta: {
    as_of: string;
    source: string;
    floor_usd: number;
    model_version: string;
    protocols: number;
    pre_token: number;
    eligible: number;
    excluded: number;
    watchlist: number;
    board_rows: number;
    total_implied_usd: number;
    median_implied_usd: number;
  };
  model: {
    formula: string;
    global_multiple: number;
    multiples: Record<string, number>;
  };
  rows: BoardRow[];
  live: LiveRow[];
  excluded: { by_reason: Record<string, number>; top: ExcludedRow[] };
  categories: { name: string; rows: number }[];
}

// ---------------------------------------------------------------- farm plans

const STEP_SETUP =
  'Set up a fresh wallet that holds only what you plan to farm with, fund it with $200–$500 in the chain’s native gas token plus stablecoins, and confirm you are on {name}’s official app by checking its domain against its official social accounts before you connect. Cost: no deposit fee, gas only. Time: 15 minutes.';

const STEP_RECORD =
  'Write down every transaction hash, date and amount in a note, and keep a small position working on {name} with one action a month — a swap, a deposit or a claim — so the activity spans months, not a single day. Cost: gas only, about $0.50–$3 per action. Time: 10 minutes a month.';

type Plan = [string, string, string, string, string];

function plan(setup: string, a: string, b: string, c: string): Plan {
  return [setup, a, b, c, STEP_RECORD];
}

/** Farm plans by category. {name} and {chain} are filled in per protocol. */
const PLANS: Record<string, Plan> = {
  Dexs: plan(
    STEP_SETUP,
    'Swap $50–$150 between two assets on {name} once a week for 4–8 weeks instead of one large trade, so the activity reads as a real user rather than a single burst. Cost: about $0.50–$3 in gas per swap on {chain}, plus the pool’s swap fee. Time: 10 minutes per swap.',
    'Add $100–$300 of liquidity to a mid-size pool on {name} and leave it in place for at least 30 days; avoid the newest pool with no volume. Cost: gas for two transactions, about $1–$6 on {chain}. Time: 20 minutes to set up, then passive.',
    'Use one advanced feature at least once — a limit order, a range order or a concentrated-liquidity position — and keep it open for a week. Cost: gas only, about $0.50–$3 per transaction. Time: 20 minutes.',
  ),
  Lending: plan(
    STEP_SETUP,
    'Supply $200–$500 of a major asset (ETH, a blue-chip stablecoin or a liquid-staked token) as collateral on {name} on {chain} and leave it supplied for at least 60 days. Cost: gas for the approval and the supply, about $1–$5 on {chain}. Time: 15 minutes.',
    'Borrow a small amount — under 30% of your collateral value — in a stablecoin, then repay half of it a week later, so the account shows both sides of the market. Cost: gas per transaction plus borrow interest, a few dollars a month at current rates. Time: 15 minutes per action.',
    'Supply on a second market {name} offers, with $50–$100, to show breadth rather than a single deposit. Cost: gas only, about $1–$3 on {chain}. Time: 20 minutes.',
  ),
  Yield: plan(
    STEP_SETUP,
    'Deposit $100–$400 into {name}’s main yield vault on {chain} and keep the position open for at least 60 days; read the vault’s strategy and fee schedule first. Cost: gas for approval and deposit, about $1–$5 on {chain}. Time: 15 minutes.',
    'Claim or compound the vault’s yield at least twice, a few weeks apart, rather than letting it sit untouched. Cost: gas per claim, about $0.50–$3 on {chain}. Time: 10 minutes per claim.',
    'Try a second vault or strategy on {name} with $50–$100 to show you use more than one product. Cost: gas only. Time: 15 minutes.',
  ),
  'Risk Curators': plan(
    STEP_SETUP,
    'Allocate $200–$500 to a {name} curator vault on {chain} and hold the vault tokens for at least 60 days; read the vault’s allocation, risk limits and fee schedule first. Cost: gas for approval and deposit, about $1–$6 on {chain}. Time: 20 minutes.',
    'Increase the allocation once, by $50–$150, after 3–4 weeks, so the position shows repeat deposits rather than a single entry. Cost: gas only. Time: 10 minutes.',
    'Withdraw a small slice (10–20%) and re-deposit it a week later to exercise the vault’s exit path while keeping most of the position. Cost: gas for both transactions. Time: 15 minutes.',
  ),
  'Onchain Capital Allocator': plan(
    STEP_SETUP,
    'Allocate $200–$500 to a {name} vault on {chain} and hold the position for at least 60 days; read what the vault allocates to and what it charges first. Cost: gas for approval and deposit, about $1–$6 on {chain}. Time: 20 minutes.',
    'Top the allocation up once, by $50–$150, after 3–4 weeks, so the position shows repeat deposits. Cost: gas only. Time: 10 minutes.',
    'Withdraw a small slice (10–20%) and re-deposit it a week later to exercise the exit path. Cost: gas for both transactions. Time: 15 minutes.',
  ),
  RWA: plan(
    STEP_SETUP,
    'Buy or mint $100–$300 of {name}’s tokenised asset on {chain} and hold it for at least 60 days. Many RWA products ask for identity verification — only complete it if you are comfortable sharing ID with that issuer. Cost: gas plus the product’s mint or purchase fee, usually under 1%. Time: 20 minutes.',
    'Collect at least two yield or coupon distributions from the asset, a few weeks apart, instead of leaving them unclaimed. Cost: gas per claim, about $0.50–$3 on {chain}. Time: 10 minutes per claim.',
    'Use the asset a second way if {name} offers it — as collateral, or on its secondary market — with a small amount, to show more than a buy-and-hold. Cost: gas only. Time: 20 minutes.',
  ),
  Restaking: plan(
    STEP_SETUP,
    'Restake $100–$300 of a liquid-staked token through {name} on {chain} and keep it restaked for at least 60 days. Cost: gas for approval and deposit, about $1–$5 on {chain}. Time: 15 minutes.',
    'Delegate to two different operators or services instead of one, splitting the stake between them. Cost: gas per delegation, about $0.50–$3 on {chain}. Time: 15 minutes.',
    'Claim restaking rewards at least twice, weeks apart, rather than leaving them to pile up untouched. Cost: gas per claim. Time: 10 minutes per claim.',
  ),
  Derivatives: plan(
    STEP_SETUP,
    'Open a small position of $50–$200 notional on {name} on {chain}, at 2x leverage or less, and close it within a week; never size a farm trade like a real bet. Cost: gas plus trading fees, usually 0.02–0.1% of notional. Time: 15 minutes per trade.',
    'Trade on 3–4 separate days over a month rather than in one session, mixing long and short or different markets. Cost: gas and fees per trade. Time: 10 minutes per trade.',
    'Provide $50–$100 of liquidity or margin to {name}’s vault or insurance fund for at least 30 days. Cost: gas only. Time: 15 minutes.',
  ),
  CDP: plan(
    STEP_SETUP,
    'Lock $200–$500 of collateral in {name} on {chain} and mint its stablecoin against it at under 40% loan-to-value. Cost: gas for approval, lock and mint, about $2–$8 total on {chain}. Time: 20 minutes.',
    'Repay part of the debt and mint again once, to show both directions of the vault. Cost: gas per transaction plus the stability fee on what you borrowed. Time: 15 minutes.',
    'Keep the vault’s collateral ratio above 200% at all times and check it weekly; top up collateral promptly if the market falls. Cost: gas for top-ups. Time: 5 minutes a week.',
  ),
  Payments: plan(
    STEP_SETUP,
    'Use {name} to send or receive $50–$200 on {chain} at least once a week for a month — real payments to real counterparties, never self-transfers. Cost: gas per payment, usually under $1 on {chain}. Time: 5 minutes per payment.',
    'Hold a balance in {name}’s account or card product for 30 days or more instead of emptying it after each payment. Cost: no fee to hold. Time: 5 minutes.',
    'Pay a real bill, merchant or subscription through {name} at least twice. Cost: gas or the product’s stated fee. Time: 10 minutes.',
  ),
  Chain: plan(
    STEP_SETUP,
    'Bridge $100–$300 onto {name} and use its native apps in the first week — at least one swap and one other transaction type. Cost: bridge fee plus gas, roughly $2–$10 total. Time: 30 minutes.',
    'Transact on {name} on 4 or more separate days over a month, mixing app types (a DEX, a lending market, an NFT or a social app). Cost: gas per transaction, usually under $1. Time: 10 minutes per session.',
    'Hold a small balance of the chain’s native token and, if staking is live, stake $50–$100 with a validator. Cost: gas only. Time: 15 minutes.',
  ),
  generic: plan(
    STEP_SETUP,
    'Deposit $100–$300 into {name}’s main product on {chain} and keep it active for at least 60 days; read the product’s fees and risks first. Cost: gas for approval and deposit, about $1–$6 on {chain}. Time: 20 minutes.',
    'Use a second feature of {name} at least once — a swap, a vault, a stake or a claim — a few weeks after the first deposit. Cost: gas only. Time: 15 minutes.',
    'Repeat one core action (deposit, swap or claim) once a month so the activity spans months, not days. Cost: gas per action. Time: 10 minutes a month.',
  ),
};

/** The farm plan for one protocol: its category's plan, filled in. */
export function farmSteps(p: SnapshotProtocol): string[] {
  const template = PLANS[p.category ?? ''] ?? PLANS['generic']!;
  const chain = p.chains[0] ?? 'its main chain';
  return template.map((step) =>
    step.replaceAll('{name}', p.name).replaceAll('{chain}', chain),
  );
}

// ---------------------------------------------------------------- build

export function parseSnapshot(text: string): Snapshot {
  const doc = JSON.parse(text) as Snapshot;
  if (!doc || typeof doc !== 'object') throw new Error('snapshot is not an object');
  if (!Array.isArray(doc.protocols) || !Array.isArray(doc.watchlist)) {
    throw new Error('snapshot lacks protocols or watchlist');
  }
  return doc;
}

/** Build the board and the dashboard data from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const multiples = categoryMultiples(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const preToken = snapshot.protocols.filter(isPreToken);

  const excluded: ExcludedRow[] = [];
  const rows: BoardRow[] = [];
  for (const p of preToken) {
    const reason = exclusionReason(p);
    if (reason !== null) {
      excluded.push({
        slug: p.slug,
        name: p.name,
        category: p.category,
        tvl_usd: p.tvl_usd,
        reason,
      });
      continue;
    }
    const { implied, age, model } = scoreProtocol(p, multiples, snapshot.as_of);
    rows.push({
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: age,
      implied_value_usd: implied,
      token_status: 'pre-token',
      on_watchlist: watchlist.has(p.slug),
      signal: signalOf(p, age),
      thesis: thesisOf(p, age, implied),
      model,
      farm_steps: farmSteps(p),
    });
  }
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      symbol: p.symbol ?? '',
    }));

  const byReason: Record<string, number> = {};
  for (const e of excluded) {
    byReason[e.reason] = (byReason[e.reason] ?? 0) + 1;
  }
  const excludedTop = [...excluded]
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, EXCLUDED_TOP);

  const catCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.category ?? 'Uncategorised';
    catCounts.set(key, (catCounts.get(key) ?? 0) + 1);
  }
  const categories = [...catCounts.entries()]
    .map(([name, count]) => ({ name, rows: count }))
    .sort((a, b) => b.rows - a.rows);

  const impliedSorted = rows.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const radar: RadarData = {
    meta: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      model_version: MODEL_VERSION,
      protocols: snapshot.protocols.length,
      pre_token: preToken.length,
      eligible: rows.length,
      excluded: excluded.length,
      watchlist: snapshot.watchlist.length,
      board_rows: rows.length,
      total_implied_usd: rows.reduce((sum, r) => sum + r.implied_value_usd, 0),
      median_implied_usd:
        impliedSorted.length % 2 === 1
          ? impliedSorted[Math.floor(impliedSorted.length / 2)]!
          : Math.round(
              (impliedSorted[impliedSorted.length / 2 - 1]! +
                impliedSorted[impliedSorted.length / 2]!) /
                2,
            ),
    },
    model: {
      formula:
        'implied = TVL x category multiple x growth multiplier x maturity multiplier x chain-breadth multiplier',
      global_multiple: Math.round(multiples.global * 10000) / 10000,
      multiples: multiples.byCategory,
    },
    rows,
    live,
    excluded: { by_reason: byReason, top: excludedTop },
    categories,
  };
  return { board: rows, radar };
}

/** The gate's own shape, checked before anything is written. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `board holds ${board.length} rows, the gate wants 100 to 4000`;
  }
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of board) {
    if (!slugs.has(row.slug)) return `row ${row.slug} is not a snapshot protocol`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `ranks are not exactly 1 to ${board.length}`;
  }
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) {
      return `implied value rises from rank ${byRank[i - 1]!.rank} to rank ${byRank[i]!.rank}`;
    }
  }
  if (new Set(byRank.map((r) => r.implied_value_usd)).size < 2) {
    return 'every implied value is the same: not a ranking';
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  for (const row of board) {
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} holds ${row.farm_steps.length} farm steps`;
    }
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `row ${row.slug} has a farm step of ${trimmed.length} characters`;
      }
    }
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug} has a bad implied value`;
    }
  }
  return null;
}

/** The dashboard's data file, written beside dashboard/. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
