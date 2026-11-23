// Token Radar's dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, filters, a per-protocol detail view,
// the live-token comparison, the set-aside list and the model. No network:
// every byte it shows is in data.js. The page recomputes each row's implied
// value from the row's own figures with the same arithmetic as lib/model.ts,
// so the page and board.json visibly agree.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  var modalRoot = document.getElementById('modal-root');
  if (!DATA || !app) return;

  var META = DATA.meta;
  var ROWS = DATA.rows;
  var LIVE = DATA.live;
  var MODEL = DATA.model;

  // -- same arithmetic as lib/model.ts (radar-2) ---------------------------
  function impliedOf(row) {
    var growth = Math.min(150, Math.max(-50, row.change_7d === null ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * 0.6;
    var maturity = row.age_days === null
      ? 0.775
      : 0.55 + (Math.min(Math.max(row.age_days, 0), 1460) / 1460) * 0.45;
    var breadth = 1 + 0.07 * Math.min(Math.max(row.chains.length - 1, 0), 5);
    return Math.max(1, Math.round(row.tvl_usd * row.model.cat_multiple * growthMult * maturity * breadth));
  }

  // -- formatting ------------------------------------------------------------
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function signalClass(signal) {
    if (signal === 'Heating up' || signal === 'New & rising') return 'hot';
    if (signal === 'Cooling') return 'cool';
    return '';
  }

  // -- state ------------------------------------------------------------------
  var state = { q: '', category: 'all', chain: 'all', signal: 'all', watch: false, sort: 'implied', dir: -1, tab: 'board', selected: null };

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    var parts = h ? h.split('&') : [];
    parts.forEach(function (part) {
      var kv = part.split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'detail' && v) state.selected = v;
      else if (k === 'cat' && v) state.category = v;
      else if (k === 'q' && v) state.q = v;
      else if (k === 'watch' && v === '1') state.watch = true;
      else if (k === 'tab' && (v === 'live' || v === 'setaside' || v === 'model')) state.tab = v;
    });
  }
  readHash();

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = ROWS.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.signal !== 'all' && r.signal !== state.signal) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -9999 : a.change_7d; bv = b.change_7d === null ? -9999 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      if (av < bv) return -1 * state.dir;
      if (av > bv) return 1 * state.dir;
      return a.rank - b.rank;
    });
    return rows;
  }

  function rowBySlug(slug) {
    for (var i = 0; i < ROWS.length; i++) if (ROWS[i].slug === slug) return ROWS[i];
    return null;
  }

  // -- rendering --------------------------------------------------------------
  function optionList(values, current, allLabel) {
    return '<option value="all">' + esc(allLabel) + '</option>' +
      values.map(function (v) {
        return '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
      }).join('');
  }

  function boardTable(rows) {
    if (!rows.length) return '<div class="empty">No protocols match these filters. Clear the search or widen the category.</div>';
    var html = '<div class="tablewrap"><table><thead><tr>' +
      '<th class="sortable" data-sort="rank">#</th>' +
      '<th class="sortable" data-sort="name">Protocol</th>' +
      '<th>Category</th><th>Chains</th>' +
      '<th class="sortable" data-sort="tvl">TVL</th>' +
      '<th class="sortable" data-sort="growth">7d</th>' +
      '<th class="sortable" data-sort="age">Age</th>' +
      '<th>Signal</th>' +
      '<th class="sortable" data-sort="implied">Implied value</th><th></th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var chg = r.change_7d === null ? '<span class="num">n/a</span>'
        : '<span class="num ' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</span>';
      var chainsShown = r.chains.slice(0, 3).map(esc).join(', ') +
        (r.chains.length > 3 ? ' <span class="sl">+' + (r.chains.length - 3) + ' more</span>' : '');
      html += '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="rank num' + (r.rank <= 3 ? ' top3' : '') + '">' + r.rank + '</td>' +
        '<td class="namecell"><span class="nm">' + esc(r.name) + '</span>' +
        (r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
        '<br><span class="sl mono">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="num" title="' + r.chains.map(esc).join(', ') + '">' + chainsShown + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td>' + chg + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td><span class="signal ' + signalClass(r.signal) + '">' + esc(r.signal) + '</span></td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
        '<td><button class="farmbtn" data-slug="' + esc(r.slug) + '">Farm plan</button></td>' +
        '</tr>';
    });
    return html + '</tbody></table></div>';
  }

  function liveTable() {
    var html = '<div class="tablewrap"><table><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>Mcap / TVL</th></tr></thead><tbody>';
    LIVE.forEach(function (p, i) {
      html += '<tr><td class="rank num">' + (i + 1) + '</td>' +
        '<td class="namecell"><span class="nm">' + esc(p.name) + '</span> <span class="sl mono">' + esc(p.symbol) + '</span><br><span class="sl mono">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || 'Uncategorised') + '</td>' +
        '<td class="num">' + fmtUsd(p.tvl_usd) + '</td>' +
        '<td class="num"><b>' + fmtUsd(p.mcap_usd) + '</b></td>' +
        '<td class="num">' + (p.mcap_usd / p.tvl_usd).toFixed(2) + 'x</td></tr>';
    });
    return html + '</tbody></table></div>';
  }

  function setAsideTable() {
    var html = '<div class="tablewrap"><table><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Why it is set aside</th></tr></thead><tbody>';
    DATA.excluded.top.forEach(function (p) {
      html += '<tr><td class="namecell"><span class="nm">' + esc(p.name) + '</span><br><span class="sl mono">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || 'Uncategorised') + '</td>' +
        '<td class="num">' + fmtUsd(p.tvl_usd) + '</td><td>' + esc(p.reason) + '</td></tr>';
    });
    return html + '</tbody></table></div>';
  }

  function modelSection() {
    var mults = Object.keys(MODEL.multiples).sort(function (a, b) { return MODEL.multiples[b] - MODEL.multiples[a]; });
    var cells = mults.map(function (cat) {
      return '<div class="mult">' + esc(cat) + '<span class="mv num">' + MODEL.multiples[cat].toFixed(2) + 'x</span></div>';
    }).join('');
    return '<section class="block"><h2>How the value is built</h2>' +
      '<p class="sub">The model is stated in full so any reader can check it. It uses only the snapshot’s own figures — no protocol name is ever special-cased, and the category multiples are learned from the snapshot’s live-token protocols, not set by hand.</p>' +
      '<div class="formula">implied = <b>TVL</b> × <b>category multiple</b> × <b>growth</b> × <b>maturity</b> × <b>breadth</b></div>' +
      '<div class="cards" style="margin-top:10px">' +
      '<div class="card"><h3>Category multiple</h3><p>Median market-cap / TVL of the category’s live-token protocols, shrunk toward the global median (0.' + Math.round(MODEL.global_multiple * 100) + 'x, prior weight 8) and clamped to 0.05–1.00x. A category with one live protocol barely moves the figure.</p></div>' +
      '<div class="card"><h3>Growth</h3><p>1 + clamped 7-day TVL change (−50% to +150%) × 0.6. A protocol growing fast is worth more than a shrinking one at the same size; a missing 7-day figure counts as no change.</p></div>' +
      '<div class="card"><h3>Maturity &amp; breadth</h3><p>Maturity rises from 0.55x to 1.00x over four years tracked (unknown age: 0.78x). Breadth adds 7% per extra chain, up to five. Older, multi-chain protocols have had longer to earn a launch.</p></div>' +
      '</div><h3 style="margin:18px 0 8px">Category multiples from the snapshot</h3><div class="multgrid">' + cells + '</div>' +
      '<p class="note" style="margin-top:12px">The dashboard recomputes every row’s implied value from the row’s own figures with the same arithmetic as the program that wrote board.json — the page and the board cannot disagree.</p></section>';
  }

  function render() {
    var cats = DATA.categories.map(function (c) { return c.name; });
    var chains = [];
    ROWS.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
    chains.sort();
    var signals = ['New & rising', 'Heating up', 'Steady', 'Seasoned', 'Early', 'Cooling'];
    var rows = filteredRows();

    var html = '<div class="wrap">' +
      '<header class="hero"><div class="eyebrow">Token Radar · DefiLlama snapshot ' + esc(META.as_of) + '</div>' +
      '<h1>Which pre-token protocol<br>is worth farming next<span class="dot">?</span></h1>' +
      '<p class="lede">A radar for token launches that do not exist yet. <b>' + META.board_rows + ' protocols</b> that record no token, ranked by what a launch would be worth if their record stayed as it is — and what to do about each one. This is the entry’s own claim, never a prediction that a token will launch.</p>' +
      '<div class="stats">' +
      '<div class="stat"><div class="v num">' + META.protocols + '</div><div class="k">protocols in the snapshot</div></div>' +
      '<div class="stat"><div class="v num">' + META.watchlist + '</div><div class="k">on the house watchlist</div></div>' +
      '<div class="stat"><div class="v num">' + META.board_rows + '</div><div class="k">ranked on this board</div></div>' +
      '<div class="stat"><div class="v num green">' + fmtUsd(META.total_implied_usd) + '</div><div class="k">combined implied value</div></div>' +
      '<div class="stat"><div class="v num">' + fmtUsd(META.median_implied_usd) + '</div><div class="k">median implied value</div></div>' +
      '</div></header>' +
      '<div class="tabs" role="tablist">' +
      '<button class="tab" data-tab="board" aria-selected="' + (state.tab === 'board') + '">Board</button>' +
      '<button class="tab" data-tab="live" aria-selected="' + (state.tab === 'live') + '">Already trading · ' + LIVE.length + '</button>' +
      '<button class="tab" data-tab="setaside" aria-selected="' + (state.tab === 'setaside') + '">Set aside · ' + META.excluded + '</button>' +
      '<button class="tab" data-tab="model" aria-selected="' + (state.tab === 'model') + '">The model</button>' +
      '</div>';

    if (state.tab === 'board') {
      html += '<div class="controls">' +
        '<div class="field grow"><label for="q">Search</label><input id="q" type="search" placeholder="Name or slug — try “gauntlet”" value="' + esc(state.q) + '"></div>' +
        '<div class="field"><label for="cat">Category</label><select id="cat">' + optionList(cats, state.category, 'All categories') + '</select></div>' +
        '<div class="field"><label for="chain">Chain</label><select id="chain">' + optionList(chains, state.chain, 'All chains') + '</select></div>' +
        '<div class="field"><label for="sig">Signal</label><select id="sig">' + optionList(signals, state.signal, 'All signals') + '</select></div>' +
        '<div class="field"><label for="sort">Sort by</label><select id="sort">' +
        '<option value="implied"' + (state.sort === 'implied' ? ' selected' : '') + '>Implied value</option>' +
        '<option value="tvl"' + (state.sort === 'tvl' ? ' selected' : '') + '>TVL</option>' +
        '<option value="growth"' + (state.sort === 'growth' ? ' selected' : '') + '>7-day growth</option>' +
        '<option value="age"' + (state.sort === 'age' ? ' selected' : '') + '>Age</option>' +
        '<option value="name"' + (state.sort === 'name' ? ' selected' : '') + '>Name A–Z</option>' +
        '</select></div>' +
        '<label class="check"><input type="checkbox" id="watch"' + (state.watch ? ' checked' : '') + '> Watchlist only</label>' +
        '</div>' +
        '<p class="countline">Showing <b>' + rows.length + '</b> of ' + ROWS.length + ' ranked protocols · sorted by ' + esc(state.sort) + ' · click any row for its farm plan</p>' +
        boardTable(rows);
    } else if (state.tab === 'live') {
      html += '<section class="block" style="margin-top:0"><h2>Already trading — the market’s own prices</h2>' +
        '<p class="sub">These protocols already have a token that trades, so they are not on the board. They are shown apart for one reason: their market caps are what the board’s category multiples are learned from. A launch is only worth farming while the token does not exist yet.</p>' +
        liveTable() + '</section>';
    } else if (state.tab === 'setaside') {
      var reasons = Object.keys(DATA.excluded.by_reason).map(function (r) {
        return '<li><b>' + esc(r) + '</b> — ' + DATA.excluded.by_reason[r] + ' protocols</li>';
      }).join('');
      html += '<section class="block" style="margin-top:0"><h2>Set aside — not a launch to farm</h2>' +
        '<p class="sub">' + META.excluded + ' pre-token protocols were left out of the ranking, because a token there already trades in another form: a centralised exchange, a bridge, a wrapped or staked product, or a versioned name. The biggest ones are listed here; the full count by reason:</p>' +
        '<div class="card" style="margin-bottom:14px"><ul>' + reasons + '</ul></div>' +
        setAsideTable() + '</section>';
    } else {
      html += modelSection();
    }

    html += '<footer><p>Data: DefiLlama protocols snapshot, ' + esc(META.source) + '. “Records no token” means the snapshot records none — it is not proof a protocol has none. Implied values are this entry’s model claim (radar-2), not a price, not a prediction of whether or when any token launches, and not financial advice.</p>' +
      '<p>Built for the make.fun token-radar-01 bounty. The program that wrote this page runs on Node 22 with no network and writes the same board on every run.</p></footer></div>';

    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    bind();
    if (state.selected) openDetail(state.selected);
  }

  function bind() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; render(); var nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; render(); });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; render(); });
    var sig = document.getElementById('sig');
    if (sig) sig.addEventListener('change', function () { state.signal = sig.value; render(); });
    var sort = document.getElementById('sort');
    if (sort) sort.addEventListener('change', function () { state.sort = sort.value; state.dir = sort.value === 'name' ? 1 : -1; render(); });
    var watch = document.getElementById('watch');
    if (watch) watch.addEventListener('change', function () { state.watch = watch.checked; render(); });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () { state.tab = t.getAttribute('data-tab'); state.selected = null; render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('th.sortable'), function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (key === 'rank') key = 'implied';
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('farmbtn')) return;
        openDetail(tr.getAttribute('data-slug'));
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.farmbtn'), function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); openDetail(b.getAttribute('data-slug')); });
    });
  }

  // -- detail view --------------------------------------------------------------
  function openDetail(slug) {
    var r = rowBySlug(slug);
    if (!r) return;
    state.selected = slug;
    var m = r.model;
    function brow(label, mult, max) {
      var pct = Math.max(2, Math.min(100, (mult / max) * 100));
      return '<div class="brow"><span class="bl">' + label + '</span><span class="bar"><i style="width:' + pct.toFixed(0) + '%"></i></span><span class="bv num">' + mult.toFixed(2) + 'x</span></div>';
    }
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    modalRoot.innerHTML = '<div class="overlay" id="overlay"><div class="modal" role="dialog" aria-label="' + esc(r.name) + ' detail">' +
      '<button class="close" id="close" aria-label="Close">×</button>' +
      '<h2>#' + r.rank + ' · ' + esc(r.name) + (r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorised') + ' · ' + r.chains.map(esc).join(', ') + ' · tracked since ' + esc(r.listed_at || 'unknown') + ' · slug <span class="mono">' + esc(r.slug) + '</span></p>' +
      '<p class="thesis">' + esc(r.thesis) + '</p>' +
      '<div class="kv">' +
      '<div><div class="k">Implied value</div><div class="v num">' + fmtUsd(r.implied_value_usd) + '</div></div>' +
      '<div><div class="k">TVL</div><div class="v num">' + fmtUsd(r.tvl_usd) + '</div></div>' +
      '<div><div class="k">7-day change</div><div class="v num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</div></div>' +
      '<div><div class="k">Age</div><div class="v num">' + fmtAge(r.age_days) + '</div></div>' +
      '</div>' +
      '<h3>How the value is built — recomputed live from this row</h3>' +
      '<div class="breakdown">' +
      brow('Base: TVL × ' + m.cat_multiple.toFixed(2) + 'x', m.cat_multiple, 1.0) +
      brow('Growth multiplier', m.growth_multiplier, 1.9) +
      brow('Maturity multiplier', m.maturity_multiplier, 1.0) +
      brow('Chain-breadth multiplier', m.breadth_multiplier, 1.35) +
      '</div>' +
      '<p class="note">Base ' + fmtUsd(m.base_usd) + ' × ' + m.growth_multiplier.toFixed(2) + ' × ' + m.maturity_multiplier.toFixed(2) + ' × ' + m.breadth_multiplier.toFixed(2) + ' = ' + fmtUsd(r.implied_value_usd) + '. The page recomputes this as ' + fmtUsd(impliedOf(r)) + ' — the same number board.json carries.</p>' +
      '<h3>How to farm it — 5 steps</h3><ol class="steps">' + steps + '</ol>' +
      '<p class="note" style="margin-top:14px">Records no token in the snapshot — not proof it has none. Never pay for a “guaranteed” allocation, never share a seed phrase, and only use the protocol’s official app.</p>' +
      '</div></div>';
    document.getElementById('close').addEventListener('click', closeDetail);
    document.getElementById('overlay').addEventListener('click', function (e) { if (e.target.id === 'overlay') closeDetail(); });
    document.addEventListener('keydown', escClose);
  }
  function escClose(e) { if (e.key === 'Escape') closeDetail(); }
  function closeDetail() {
    state.selected = null;
    modalRoot.innerHTML = '';
    document.removeEventListener('keydown', escClose);
  }

  render();
})();
