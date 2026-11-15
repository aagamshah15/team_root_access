/* Harvest Window: the grower-facing app (lane L04).
 *
 * Reads the published JSON files in data/ (contracts/app-data.md). If data/ is empty it falls back to
 * mock/ and says so in the banner. Every figure on screen comes from those files; this script only
 * looks values up, formats them and draws them. No network calls besides d3 from cdnjs.
 */
(function () {
  'use strict';

  const FILES = ['customers', 'rooms', 'days', 'forecast', 'whatif', 'evidence', 'alerts', 'backtest', 'assumptions'];
  const OPTIONAL = ['shipping'];          // shipping extension; mock/ has none, so the section hides
  const PLUCK_WHY = {
    weight: 'the fruit is estimated to stop gaining weight on this day, so picking from then on costs no weight; it only turns red after that',
    sellable: 'it is the first day enough pots are ready to sell when they arrive (the fruit had already stopped growing)',
    today: 'both conditions are already met: the fruit has stopped growing and enough pots sell on arrival',
  };
  const DEFAULT_TODAY = '2024-11-06';     // SPEC D3: replay "today" defaults to 6 Nov 2024
  const ALERT_DAYS = 7;                   // an alert counts as "recent" for this many days (display rule)
  const STATUS = {
    harvest_now: { label: 'Harvest now', ico: '✓', why: 'Today is inside the likely best-day range and enough pots are ready to sell.' },
    plan_harvest: { label: 'Plan harvest', ico: '◷', why: 'The best day is within the next week: book labour and transport now.' },
    keep_growing: { label: 'Keep growing', ico: '↗', why: 'The best day is more than a week away. Extra days still add value.' },
    check_crop: { label: 'Check crop', ico: '!', why: 'We are not sure enough to call a date. Walk the room or take a crop sample before deciding.' },
  };
  const CONF = { high: ['High', 3], medium: ['Medium', 2], low: ['Low', 1] };
  const AGREE = {
    agree: ['Agree', 'Warmth model, photo and crop sample tell the same story.'],
    mixed: ['Partly agree', 'The signals differ a little on how ripe the room is.'],
    conflict: ['Disagree', 'The signals point to different ripeness. Check the crop.'],
  };
  const MODEL = {
    warmth: 'Warmth only (degree-days since planting)',
    'warmth+camera': 'Warmth, anchored by the canopy photos',
    'warmth+camera+sample': 'Warmth + photos + the latest crop sample',
  };

  const S = { data: null, base: 'data/', mock: false, customer: null, today: DEFAULT_TODAY, view: 'home', room: null, delta: 0, dest: null,
    chat: { key: null, turns: [], plan: null, busy: false, ctl: null } };
  const idx = {};
  const $ = (sel, el = document) => el.querySelector(sel);
  const main = $('#main');
  const tip = $('#tooltip');

  /* ---------- formatting ---------- */
  const parse = d3.utcParse('%Y-%m-%d');
  const fmtISO = d3.utcFormat('%Y-%m-%d');
  const fmtDay = d3.utcFormat('%a %-d %b');
  const fmtShort = d3.utcFormat('%-d %b');
  const addDays = (s, n) => fmtISO(d3.utcDay.offset(parse(s), n));
  const diff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);   // days from a to b
  const day = (s) => (s ? fmtDay(parse(s)) : '—');
  const short = (s) => (s ? fmtShort(parse(s)) : '—');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function euro(v, dp = 2) {
    if (v == null) return '—';
    const s = '€' + Math.abs(v).toFixed(dp);
    return v < 0 ? '−' + s : s;
  }
  const signedEuro = (v, dp = 2) => (v == null ? '—' : (v > 0 ? '+' : '') + euro(v, dp));
  const pct = (v) => (v == null ? '—' : Math.round(v) + '%');
  const share = (v) => (v == null ? '—' : Math.round(v * 100) + '%');
  function rel(from, to) {
    if (!to) return '';
    const n = diff(from, to);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return n > 0 ? `in ${n} days` : `${-n} days ago`;
  }
  const span2 = (a, b, sep = '–') => (a === b ? short(a) : `${short(a)}${sep}${short(b)}`);
  const windowText = (d) => (!d.earliest_sellable_day ? 'not sellable within the forecast'
    : `${short(d.earliest_sellable_day)} – ${d.losses_start_day ? short(d.losses_start_day) : 'beyond forecast'}`);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const humanKey = (k) => k.replace(/_/g, ' ').replace(/\bpct\b/g, '%').replace(/\bgdd\b/g, 'degree-days').replace(/\bc\b/g, '°C');

  /* ---------- data ---------- */
  async function fetchJSON(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }
  async function loadFolder(base) {
    const docs = await Promise.all(FILES.map((f) => fetchJSON(base + f + '.json')));
    const out = {};
    FILES.forEach((f, i) => (out[f] = docs[i]));
    for (const f of OPTIONAL) {
      try { out[f] = await fetchJSON(base + f + '.json'); } catch (e) { out[f] = { meta: {}, rows: [] }; }
    }
    return out;
  }
  async function load() {
    // Probe one file first so a missing data/ folder costs a single 404, then load the rest.
    let hasData = false;
    try { hasData = (await fetch('data/customers.json', { cache: 'no-cache' })).ok; } catch (e) { hasData = false; }
    S.base = hasData ? 'data/' : 'mock/';
    S.data = await loadFolder(S.base);
    S.mock = FILES.some((f) => S.data[f].meta && S.data[f].meta.mock);
    buildIndex();
  }
  function groupBy(rows, keyFn) {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  }
  function buildIndex() {
    const D = S.data;
    idx.customers = D.customers.rows;
    idx.rooms = new Map(D.rooms.rows.map((r) => [r.room, r]));
    idx.days = new Map(D.days.rows.map((r) => [r.room + '|' + r.today, r]));
    idx.daysByRoom = groupBy(D.days.rows, (r) => r.room);
    idx.daysByRoom.forEach((v) => v.sort((a, b) => d3.ascending(a.today, b.today)));
    idx.forecast = groupBy(D.forecast.rows, (r) => r.room + '|' + r.today);
    idx.forecast.forEach((v) => v.sort((a, b) => d3.ascending(a.date, b.date)));
    idx.whatif = new Map(D.whatif.rows.map((r) => [r.room + '|' + r.today + '|' + Number(r.delta_c), r]));
    idx.deltas = [...new Set(D.whatif.rows.map((r) => Number(r.delta_c)))].sort(d3.ascending);
    idx.evidence = new Map(D.evidence.rows.map((r) => [r.room + '|' + r.date, r]));
    idx.evidenceByRoom = groupBy(D.evidence.rows, (r) => r.room);
    idx.alerts = D.alerts.rows.slice().sort((a, b) => d3.descending(a.date, b.date));
    idx.ship = new Map(D.shipping.rows.map((r) => [r.room + '|' + r.today + '|' + r.destination, r]));
    idx.dests = D.shipping.meta.destinations || [];
    idx.truck = D.shipping.meta.truck || {};
    if (!S.dest) S.dest = idx.truck.default_destination || (idx.dests[0] || {}).id;
    const todays = D.days.rows.map((r) => r.today);
    idx.minToday = d3.min(todays);
    idx.maxToday = d3.max(todays);
  }
  const customer = () => idx.customers.find((c) => c.customer_id === S.customer) || idx.customers[0];
  const roomName = (id) => (idx.rooms.get(id) || {}).display_name || id;
  function photoURL(p) {
    if (!p) return null;
    if (/^(data|mock)\//.test(p)) return p;
    return S.base + p.replace(/^\.?\//, '');
  }
  function recentAlerts(rooms) {
    const from = addDays(S.today, -(ALERT_DAYS - 1));
    return idx.alerts.filter((a) => rooms.includes(a.room) && a.date <= S.today && a.date >= from);
  }

  /* ---------- state in the URL hash, so a demo link reopens the same screen ---------- */
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    S.view = ['home', 'room', 'alerts', 'how'].includes(p.get('view')) ? p.get('view') : 'home';
    S.room = p.get('room');
    const owner = S.room && idx.rooms.get(S.room);
    if (owner && !p.get('c')) S.customer = owner.customer_id;   // deep link to a room opens its own customer
    if (p.get('c') && idx.customers.some((c) => c.customer_id === p.get('c'))) S.customer = p.get('c');
    if (!S.customer) S.customer = idx.customers[0].customer_id;
    const t = p.get('t');
    if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) S.today = clampToday(t);
    if (S.view === 'room' && !(S.room && customer().rooms.includes(S.room))) S.view = 'home';
  }
  function hashFor(over = {}) {
    const st = Object.assign({ view: S.view, room: S.room, c: S.customer, t: S.today }, over);
    const p = new URLSearchParams();
    p.set('view', st.view);
    if (st.view === 'room' && st.room) p.set('room', st.room);
    p.set('c', st.c);
    p.set('t', st.t);
    return '#' + p.toString();
  }
  function go(over) {
    const h = hashFor(over);
    if (h === location.hash) render();
    else location.hash = h;
  }
  const clampToday = (t) => (t < idx.minToday ? idx.minToday : t > idx.maxToday ? idx.maxToday : t);

  /* ---------- controls ---------- */
  function initControls() {
    const sel = $('#customer');
    sel.innerHTML = idx.customers.map((c) => `<option value="${esc(c.customer_id)}">${esc(c.name)} (demo)</option>`).join('');
    sel.addEventListener('change', () => go({ c: sel.value, view: S.view === 'room' ? 'home' : S.view }));
    const inp = $('#today');
    inp.min = idx.minToday;
    inp.max = idx.maxToday;
    inp.addEventListener('change', () => inp.value && go({ t: clampToday(inp.value) }));
    $('#day-prev').addEventListener('click', () => go({ t: clampToday(addDays(S.today, -1)) }));
    $('#day-next').addEventListener('click', () => go({ t: clampToday(addDays(S.today, 1)) }));
    $('#theme').addEventListener('click', toggleTheme);
    try {
      const t = localStorage.getItem('hw-theme');
      if (t) document.documentElement.dataset.theme = t;
    } catch (e) { /* storage blocked: follow the OS setting */ }
    let timer;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(render, 150); });
    window.addEventListener('hashchange', () => { readHash(); render(); });
  }
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('hw-theme', root.dataset.theme); } catch (e) { /* ignore */ }
    render();
  }
  function syncControls() {
    $('#customer').value = S.customer;
    $('#today').value = S.today;
    $('#day-prev').disabled = S.today <= idx.minToday;
    $('#day-next').disabled = S.today >= idx.maxToday;
    document.querySelectorAll('.tabs a').forEach((a) => {
      const v = a.dataset.view;
      a.href = hashFor({ view: v });
      const on = v === S.view || (v === 'home' && S.view === 'room');
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const n = recentAlerts(customer().rooms).length;
    $('#alert-count').textContent = n ? String(n) : '';
    $('#mock-flag').hidden = !S.mock;
    const m = S.data.days.meta;
    $('#data-source').textContent = `Source: ${m.source}. Built ${short(m.built_at.slice(0, 10))}. Replay dates ${short(m.as_of.from)}–${short(m.as_of.to)}.`;
  }

  /* ---------- shared bits ---------- */
  function pill(status) {
    const s = STATUS[status];
    if (!s) return '';
    return `<span class="pill ${status}"><span class="ico" aria-hidden="true">${s.ico}</span>${s.label}</span>`;
  }
  function confBadge(level) {
    const c = CONF[level];
    if (!c) return '—';
    const dots = [1, 2, 3].map((i) => `<i class="${i <= c[1] ? 'on' : ''}"></i>`).join('');
    return `<span class="conf"><span class="conf-dots" aria-hidden="true">${dots}</span>${c[0]}</span>`;
  }
  function roomState(room) {
    const meta = idx.rooms.get(room);
    if (meta && meta.actual_harvest && S.today >= meta.actual_harvest) return { kind: 'harvested', meta };
    const d = idx.days.get(room + '|' + S.today);
    if (!d) return { kind: 'none', meta };
    return { kind: 'live', meta, d };
  }

  /* ---------- screen 1: my greenhouses ---------- */
  function renderHome() {
    const c = customer();
    const states = c.rooms.map((r) => ({ room: r, ...roomState(r) }));
    const live = states.filter((s) => s.kind === 'live');
    const counts = d3.rollup(live, (v) => v.length, (s) => s.d.status);
    const bits = Object.keys(STATUS).filter((k) => counts.get(k)).map((k) => `${plural(counts.get(k), 'room')} <b>${STATUS[k].label.toLowerCase()}</b>`);
    const done = states.filter((s) => s.kind === 'harvested').length;
    if (done) bits.push(`${plural(done, 'room')} already harvested`);
    main.innerHTML = `
      <div class="page-head">
        <h1>${esc(c.name)}</h1>
        <p class="muted">${esc(c.tagline)}</p>
        <p class="lede">On <b>${day(S.today)}</b>: ${bits.length ? bits.join(', ') : 'no forecast for this day'}.</p>
      </div>
      <div class="grid">${states.map(roomCard).join('')}</div>`;
  }
  function roomCard(s) {
    const name = esc(roomName(s.room));
    if (s.kind === 'harvested') {
      return `<a class="card room-card harvested" href="${hashFor({ view: 'room', room: s.room })}">
        <div class="rc-head"><div><div class="rc-name">${name}</div></div><span class="pill done">Harvested</span></div>
        <div class="rc-sub">What the grower actually did</div>
        <div class="rc-best">${day(s.meta.actual_harvest)}</div>
        <div class="rc-more">See the replay →</div></a>`;
    }
    if (s.kind === 'none') {
      return `<div class="card room-card"><div class="rc-head"><div class="rc-name">${name}</div></div>
        <p class="muted">No forecast for ${day(S.today)}.</p></div>`;
    }
    const d = s.d;
    const n = recentAlerts([s.room]).length;
    return `<a class="card room-card" href="${hashFor({ view: 'room', room: s.room })}" aria-label="${name}: ${STATUS[d.status].label}">
      <div class="rc-head"><div><div class="rc-name">${name}</div></div>${pill(d.status)}</div>
      <div class="rc-sub">Best harvest day (estimate)</div>
      <div class="rc-best">${day(d.best_day)} <span class="rc-sub">${rel(S.today, d.best_day)}</span></div>
      <div class="rc-sub">Likely ${span2(d.best_day_low, d.best_day_high)} · window ${windowText(d)}</div>
      <div class="facts">
        <div><div class="fact-k">How sure we are</div><div class="fact-v">${confBadge(d.confidence)}</div></div>
        <div><div class="fact-k">Pots ready to sell today</div><div class="fact-v">${share(d.sellable_share_now)}</div></div>
        <div><div class="fact-k">Fruit red today</div><div class="fact-v">${pct(d.pct_red_now)}</div></div>
        <div><div class="fact-k">Alerts (last ${ALERT_DAYS} days)</div><div class="fact-v">${n}</div></div>
      </div>
      <div class="rc-more">Why, and what-if →</div></a>`;
  }

  /* ---------- screen 2: room detail ---------- */
  function renderRoom() {
    const room = S.room;
    const st = roomState(room);
    const meta = st.meta;
    const back = `<a class="back" href="${hashFor({ view: 'home' })}">← My greenhouses</a>`;
    if (st.kind !== 'live') {
      const last = (idx.daysByRoom.get(room) || []).filter((r) => r.today < meta.actual_harvest).pop();
      main.innerHTML = `${back}<div class="page-head"><h1>${esc(roomName(room))}</h1>
        <p class="lede">${st.kind === 'harvested'
          ? `This room was harvested on <b>${day(meta.actual_harvest)}</b> (what the grower actually did).`
          : `No forecast for ${day(S.today)}.`}</p>
        ${last ? `<p><a href="${hashFor({ t: last.today })}">Go back to ${day(last.today)}, the last day before harvest →</a></p>` : ''}</div>`;
      return;
    }
    const d = st.d;
    const fc = idx.forecast.get(room + '|' + S.today) || [];
    const ev = idx.evidence.get(room + '|' + S.today);
    const area = meta.area_m2;
    const atEdge = fc.length > 0 && d.best_day === fc[fc.length - 1].date;
    main.innerHTML = `${back}
      <div class="page-head">
        <div class="room-top"><h1>${esc(roomName(room))}</h1>${pill(d.status)}</div>
        <p class="lede">Best harvest day is an estimated <b>${day(d.best_day)}</b> (${rel(S.today, d.best_day)})${d.best_day_low === d.best_day_high ? '' : ', '}${d.best_day_low === d.best_day_high ? '' : `likely between ${short(d.best_day_low)} and ${short(d.best_day_high)}`}${atEdge ? ' — at the end of the forecast, so it may be later' : ''}. ${esc(STATUS[d.status].why)}</p>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-k">Best harvest day</div><div class="kpi-v">${short(d.best_day)}</div><div class="kpi-s">${euro(d.profit_best_m2_day)} per m² per day grown</div></div>
        <div class="kpi"><div class="kpi-k">Harvest window</div><div class="kpi-v">${windowText(d)}</div><div class="kpi-s">earliest sellable → losses start</div></div>
        <div class="kpi"><div class="kpi-k">How sure we are</div><div class="kpi-v">${confBadge(d.confidence)}</div><div class="kpi-s">best day range: ${plural(d.conf_day_range_days, 'day')}</div></div>
        <div class="kpi"><div class="kpi-k">Pots ready to sell today</div><div class="kpi-v">${share(d.sellable_share_now)}</div><div class="kpi-s">fruit ${pct(d.pct_red_now)} red (likely ${pct(d.pct_red_low)}–${pct(d.pct_red_high)})</div></div>
      </div>
      <div class="two">
        <section class="card">
          <h2>Harvest window</h2>
          <p class="finding">${profitFinding(d)}</p>
          <div class="legend">
            <span><i class="sw"></i>Expected profit</span><span><i class="sw band"></i>Low–high range</span>
            <span><i class="sw range"></i>Likely best day</span><span><i class="sw actual"></i>Grower's actual harvest</span>
            ${S.delta ? '<span><i class="sw whatif"></i>What-if best day</span>' : ''}
          </div>
          <div class="chart" id="chart-profit"></div>
          <p class="caption">€ per m² per day grown, after plant, re-spacing, energy and fixed costs. Range: ripening early or late and price low or high. Source: forecast.json, days.json (model estimate; assumptions labelled on "How it works").</p>
          ${numbersTable(fc, [['date', 'Day', short], ['profit_low', 'Low €', (v) => euro(v)], ['profit_m2_day', 'Expected €', (v) => euro(v)], ['profit_high', 'High €', (v) => euro(v)], ['sellable_share', 'Pots ready', share]])}
        </section>
        <section class="card">
          <h2>Ripeness forecast</h2>
          <p class="finding">An estimated ${pct(d.pct_red_now)} of fruit weight is red today (likely ${pct(d.pct_red_low)}–${pct(d.pct_red_high)}); ${share(d.sellable_share_now)} of pots would sell.</p>
          <div class="legend">
            <span><i class="sw past"></i>Earlier estimates</span><span><i class="sw"></i>Forecast</span><span><i class="sw band"></i>Likely range</span>
            <span><i class="sw dot"></i>Crop sample (hand-weighed)</span><span><i class="sw actual"></i>Actual harvest</span>
          </div>
          <div class="chart" id="chart-ripe"></div>
          <p class="caption">% of fruit weight that is red. Forecast from warmth since planting (degree-days), corrected by photos and crop samples. Source: days.json, forecast.json, evidence.json.</p>
          ${numbersTable(fc, [['date', 'Day', short], ['pct_red_low', 'Low', pct], ['pct_red', 'Expected', pct], ['pct_red_high', 'High', pct]])}
        </section>
      </div>
      <div class="two">
        <section class="card">
          <h2>How sure we are: ${confBadge(d.confidence)}</h2>
          <p class="muted small">The level is the weakest of three checks.</p>
          <div class="parts">
            <div class="part"><div class="part-k">Day range</div><div class="part-v">${plural(d.conf_day_range_days, 'day')}</div><div class="part-s">Likely range of the best day (${span2(d.best_day_low, d.best_day_high)}). Narrower is better.</div></div>
            <div class="part"><div class="part-k">Evidence agreement</div><div class="part-v">${(AGREE[d.conf_agreement] || ['—'])[0]}</div><div class="part-s">${(AGREE[d.conf_agreement] || ['', ''])[1]}</div></div>
            <div class="part"><div class="part-k">Freshness</div><div class="part-v">${plural(d.conf_freshness_days, 'day')}</div><div class="part-s">Days since the last crop sample or the last photo, whichever was longer ago.</div></div>
          </div>
          <h3>Why</h3>
          <ul class="reasons">${(d.conf_reasons || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          <p class="caption">Model used today: ${esc(MODEL[d.model] || d.model)}. Source: days.json.</p>
        </section>
        <section class="card">
          <h2>Today's evidence</h2>
          ${evidenceBlock(ev, d)}
        </section>
      </div>
      ${idx.dests.length ? `<section class="card section" id="ship">
        <h2>When to pluck for shipping</h2>
        <p class="muted small">Pick where the pots go. The pluck day is the earliest day the fruit has stopped gaining weight and enough pots are ready to sell when they arrive; picking later only uses up shelf life.</p>
        <div class="whatif-ctl">
          <label for="dest" class="ctl-label">Destination</label>
          <select id="dest">${idx.dests.map((x) => `<option value="${esc(x.id)}"${x.id === S.dest ? ' selected' : ''}>${esc(x.name)} · ${Number(x.distance_km).toLocaleString('en')} km · ${x.transit_days ? plural(x.transit_days, 'day') + ' by truck' : 'same day'}</option>`).join('')}</select>
        </div>
        <div id="ship-out" aria-live="polite"></div>
        <h3>All destinations</h3>
        <div id="ship-table"></div>
        <p class="caption">${shipCaption()}</p>
        <h3>Plan your own trip</h3>
        <form id="trip-form" class="trip-form">
          <label>Where to<input name="name" maxlength="60" value="My buyer"></label>
          <label>Road distance (km)<input name="distance_km" type="number" min="0" max="5000" step="10" value="1200" required></label>
          <label>Drivers<select name="drivers"><option value="1">1 (8 h a day)</option><option value="2">2 (16 h a day)</option></select></label>
          <label>Truck temperature (°C)<input name="transit_temp_c" type="number" min="0" max="30" step="0.5" value="${idx.truck.temp_c}" required></label>
          <label>Shop temperature (°C)<input name="shop_temp_c" type="number" min="5" max="35" step="0.5" value="${idx.truck.shop_temp_c}" required></label>
          <label>Best days wanted on the shelf<input name="min_best_shelf_days" type="number" min="1" max="14" step="1" value="${idx.truck.min_best_shelf_days}" required></label>
          <button class="btn" type="submit">Work out the pluck day</button>
        </form>
        <div id="trip-out" aria-live="polite"></div>
        <h3>Ask the shipping assistant</h3>
        <p class="muted small">Tell it where the pots go and how they travel; it asks what it needs, then works out the pluck day with the same model. Answers are AI-written estimates and use your own Claude allowance.</p>
        <div class="chat">
          <div class="chat-log" id="chat-log" aria-live="polite"></div>
          <form id="chat-form" class="chat-form">
            <label class="sr-only" for="chat-input">Message to the shipping assistant</label>
            <textarea id="chat-input" rows="2" maxlength="1000" placeholder="e.g. 3,000 pots to a garden centre near Vienna by refrigerated truck; the buyer checks them on arrival"></textarea>
            <div class="chat-btns"><button class="btn" type="submit" id="chat-send">Send</button><button class="btn ghost" type="button" id="chat-stop" hidden>Stop</button><button class="btn ghost" type="button" id="chat-reset">New chat</button></div>
          </form>
          <p class="note" id="chat-note"></p>
        </div>
      </section>` : ''}
      <section class="card section" id="whatif">
        <h2>What if the room ran warmer or cooler?</h2>
        <p class="muted small">Change the room's average temperature from today on. Warmer rooms ripen faster but use more heating.</p>
        <div class="whatif-ctl">
          <label for="delta" class="ctl-label">Temperature change</label>
          <input type="range" id="delta" min="${idx.deltas[0]}" max="${idx.deltas[idx.deltas.length - 1]}" step="${idx.deltas[1] - idx.deltas[0]}" value="${S.delta}" aria-describedby="wi-out">
          <output class="whatif-val" id="delta-val" for="delta"></output>
          <div class="scale" aria-hidden="true"><span>cooler</span><span>as now</span><span>warmer</span></div>
        </div>
        <div id="wi-out" aria-live="polite"></div>
      </section>`;
    drawProfit($('#chart-profit'), fc, d, meta);
    drawRipe($('#chart-ripe'), fc, d, meta);
    const slider = $('#delta');
    slider.addEventListener('input', () => {
      S.delta = Number(slider.value);
      updateWhatif(d, area);
      drawProfit($('#chart-profit'), fc, d, meta);
    });
    updateWhatif(d, area);
    if (idx.dests.length) {
      const sel = $('#dest');
      sel.addEventListener('change', () => { S.dest = sel.value; updateShip(d); });
      updateShip(d);
      setupTrip(d, fc);
      setupChat(d, fc);
    }
  }
  function shipCaption() {
    const t = idx.truck;
    return `Model estimate. Refrigerated truck at ${t.temp_c} °C, one driver ${t.driving_hours_per_day} h a day at ${t.avg_speed_kmh} km/h (same day up to ${t.same_day_km} km); shop ${t.shop_temp_c} °C. Best condition = ${t.best_band_pct_red[0]}–${t.best_band_pct_red[1]}% of fruit weight red; off the shelf at ${t.end_of_life_pct_red}%. Pots are judged when they arrive. Distances are approximate road distances from the greenhouse (Bleiswijk, NL). Source: shipping.json, days.json; assumptions on "How it works".`;
  }
  function shipLine(r, dest) {
    const arrive = addDays(r.pluck_day, dest.transit_days);
    return { arrive, from: addDays(arrive, r.best_from), until: addDays(arrive, r.best_until), sell: addDays(arrive, r.sell_until) };
  }
  function updateShip(d) {
    const dest = idx.dests.find((x) => x.id === S.dest) || idx.dests[0];
    const r = idx.ship.get(S.room + '|' + S.today + '|' + dest.id);
    const out = $('#ship-out');
    if (!r) {
      out.innerHTML = `<p class="finding">No pluck day within the 21-day forecast yet.</p><p class="muted small">The fruit is estimated to stop gaining weight on ${day(d.weight_complete_day)}. Check again closer to that day.</p>`;
    } else {
      const L = shipLine(r, dest);
      const late = r.ship_by_day && r.pluck_day > r.ship_by_day;
      const tooLong = dest.transit_days > idx.truck.max_transit_days;
      const gap = r.profit_m2_day - r.profit_best_m2_day;
      out.innerHTML = `
        <p class="finding">Pluck on ${day(r.pluck_day)} (${rel(S.today, r.pluck_day)}): ${esc(PLUCK_WHY[r.pluck_reason])}.</p>
        <div class="wi-out">
          <div class="part"><div class="part-k">Fruit stops growing</div><div class="part-v">${short(d.weight_complete_day)}</div><div class="part-s">98% of final fruit weight (estimate)</div></div>
          <div class="part"><div class="part-k">Pluck day</div><div class="part-v">${short(r.pluck_day)}</div><div class="part-s">fruit ${pct(r.pct_at_pluck)} red when picked</div></div>
          <div class="part"><div class="part-k">Arrives in ${esc(dest.name)}</div><div class="part-v">${short(L.arrive)}</div><div class="part-s">${pct(r.pct_on_arrival)} red · ${share(r.sellable_on_arrival)} of pots ready to sell</div></div>
          <div class="part"><div class="part-k">Best on the shelf</div><div class="part-v">${span2(L.from, L.until)}</div><div class="part-s">${plural(r.best_until - r.best_from + 1, 'day')} · sell by ${short(L.sell)}</div></div>
          <div class="part"><div class="part-k">Profit at pluck day</div><div class="part-v">${euro(r.profit_m2_day, 3)}</div><div class="part-s">per m² per day; best-profit day ${short(r.best_profit_day)} gives ${euro(r.profit_best_m2_day, 3)} (${signedEuro(gap, 3)})</div></div>
        </div>
        ${late ? `<p class="note">Plucking this late leaves fewer than ${idx.truck.min_best_shelf_days} days in best condition: the last day that still does is ${day(r.ship_by_day)}.</p>` : `<p class="note">Latest pluck day that still leaves ${idx.truck.min_best_shelf_days}+ days in best condition: ${day(r.ship_by_day)}.</p>`}
        ${tooLong ? `<p class="note">${plural(dest.transit_days, 'day')} on the road is more than ${idx.truck.max_transit_days}: potted plants may yellow and drop fruit in a dark truck.</p>` : ''}`;
    }
    const rows = idx.dests.map((x) => [x, idx.ship.get(S.room + '|' + S.today + '|' + x.id)]);
    $('#ship-table').innerHTML = `<div class="table-wrap"><table class="nums"><thead><tr><th>Destination</th><th class="r">Truck</th><th>Pluck</th><th>Arrives</th><th class="r">Red on arrival</th><th>Best on shelf</th><th>Sell by</th></tr></thead><tbody>
      ${rows.map(([x, r]) => {
        if (!r) return `<tr><td>${esc(x.name)}</td><td class="r">${x.transit_days ? plural(x.transit_days, 'day') : 'same day'}</td><td colspan="5" class="muted">beyond the forecast</td></tr>`;
        const L = shipLine(r, x);
        return `<tr${x.id === S.dest ? ' class="win"' : ''}><td>${esc(x.name)}</td><td class="r">${x.transit_days ? plural(x.transit_days, 'day') : 'same day'}</td><td>${short(r.pluck_day)}</td><td>${short(L.arrive)}</td><td class="r">${pct(r.pct_on_arrival)}</td><td>${span2(L.from, L.until)}</td><td>${short(L.sell)}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }
  /* ---------- custom trip and shipping assistant (shipping extension) ---------- */
  function tripHTML(plan, label) {
    if (!plan.pluck_day) {
      return `<p class="finding">${esc(label)}: no pluck day within the 21-day forecast yet (fruit estimated to stop growing ${day(plan.weight_complete_day)}).</p>`;
    }
    const warn = [];
    if (plan.chilling_risk) warn.push(`A truck below 10 °C risks chilling damage (poor colour, soft spots).`);
    if (plan.too_long) warn.push(`${plural(plan.transit_days, 'day')} on the road is more than ${idx.truck.max_transit_days}: potted plants may yellow and drop fruit in a dark truck.`);
    if (plan.late) warn.push(`Plucking this late leaves fewer than ${plan.min_best_shelf_days} best days on the shelf.`);
    return `<p class="finding">${esc(label)}: pluck on ${day(plan.pluck_day)} (${rel(S.today, plan.pluck_day)}), ${esc(PLUCK_WHY[plan.pluck_reason])}.</p>
      <div class="wi-out">
        <div class="part"><div class="part-k">On the road</div><div class="part-v">${plan.transit_days ? plural(plan.transit_days, 'day') : 'same day'}</div><div class="part-s">truck ${plan.transit_temp_c} °C</div></div>
        <div class="part"><div class="part-k">Arrives</div><div class="part-v">${short(plan.arrival_day)}</div><div class="part-s">${pct(plan.pct_on_arrival)} red · ${share(plan.sellable_on_arrival)} of pots ready to sell</div></div>
        <div class="part"><div class="part-k">Best on the shelf</div><div class="part-v">${plan.best_shelf_days ? span2(plan.best_from, plan.best_until) : '—'}</div><div class="part-s">${plan.best_shelf_days ? plural(plan.best_shelf_days, 'day') + ' · ' : ''}sell by ${short(plan.sell_until)}</div></div>
        <div class="part"><div class="part-k">Latest pluck day</div><div class="part-v">${short(plan.ship_by_day)}</div><div class="part-s">still ${plan.min_best_shelf_days}+ best days</div></div>
      </div>${warn.map((w) => `<p class="note">${esc(w)}</p>`).join('')}`;
  }
  function setupTrip(d, fc) {
    const form = $('#trip-form');
    const run = () => {
      if (!form.checkValidity()) { $('#trip-out').innerHTML = '<p class="muted small">Check the highlighted values.</p>'; return; }
      const f = new FormData(form);
      const plan = Trip.planTrip(fc, d, idx.truck, { distance_km: +f.get('distance_km'), drivers: +f.get('drivers'),
        transit_temp_c: +f.get('transit_temp_c'), shop_temp_c: +f.get('shop_temp_c'), min_best_shelf_days: +f.get('min_best_shelf_days') });
      $('#trip-out').innerHTML = tripHTML(plan, String(f.get('name') || 'Your trip') + ` (${(+f.get('distance_km')).toLocaleString('en')} km)`);
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
    if (S.chat.plan && S.chat.key === S.room + '|' + S.today) $('#trip-out').innerHTML = tripHTML(S.chat.plan.plan, S.chat.plan.label);
  }

  let samplePromise = null;
  const getSample = () => (samplePromise ||= (window.claude && window.claude.use ? window.claude.use('sample') : Promise.resolve(null)));
  const CHAT_ERR = {
    not_granted: 'The assistant needs your permission to use Claude in this app. It stays off for this visit.',
    sampling_disabled: 'Claude is not available for this account.', tools_unavailable: 'This view cannot run the assistant’s calculator.',
    rate_limited: 'Too many requests just now. Try again in a minute.', session_expired: 'Please sign in to Claude again.',
    refused: 'The assistant could not answer that. Try rephrasing.', empty_completion: 'No answer came back. Try a shorter question.',
  };
  function chatRules(d) {
    return `You are the shipping assistant inside "Harvest Window", a greenhouse app for dwarf tomatoes sold as whole potted plants.
The grower is deciding where these pots go, how they travel, and therefore when to pluck (harvest) them.
Greenhouse location: Bleiswijk, the Netherlands. Room: ${roomName(S.room)}. Today (replayed data): ${S.today}.
Rules:
- Call get_room_context first if you need the room's ripeness or the preset destinations.
- Before giving any date, call plan_trip. Never invent dates, percentages or shelf days: quote the tool's numbers.
- If the grower has not said where the pots go or how they travel, ask (at most two short questions). Useful facts: destination, transport (refrigerated truck, normal truck, sea container, air), truck temperature, one or two drivers, whether the buyer checks the pots on arrival, how many best days on the shelf they need.
- For a named place, estimate the road distance from Bleiswijk and say it is approximate. For sea or air, set transit_days yourself and state the assumption. A normal unrefrigerated truck runs at about 18 °C.
- Compare a few options with plan_trip when the grower is choosing between destinations or transport.
- Mention warnings the tool returns (chilling below 10 °C, more than ${idx.truck.max_transit_days} days in a truck, plucking after the latest day).
- Plain words for a busy grower, under 120 words, dates like "Tue 12 Nov". Say "estimated"; these are model estimates on replayed 2024 data.`;
  }
  function chatTools(d, fc) {
    const summary = (p) => p.pluck_day ? { pluck_day: p.pluck_day, pluck_reason: p.pluck_reason, days_on_road: p.transit_days,
      truck_temp_c: p.transit_temp_c, arrival_day: p.arrival_day, red_on_arrival_pct: Math.round(p.pct_on_arrival),
      pots_ready_on_arrival_pct: Math.round(p.sellable_on_arrival * 100), best_on_shelf: [p.best_from, p.best_until],
      best_days_on_shelf: p.best_shelf_days, sell_by: p.sell_until, latest_pluck_day_for_wanted_shelf_days: p.ship_by_day,
      fruit_stops_growing: p.weight_complete_day, warnings: { chilling_risk: p.chilling_risk, too_long_for_potted_plants: p.too_long, late: p.late } }
      : { pluck_day: null, note: 'No pluck day within the 21-day forecast', fruit_stops_growing: p.weight_complete_day };
    return [
      { name: 'get_room_context', description: 'Returns the room’s state today (ripeness, fruit stops growing, best-profit day) and the pluck plan for each preset destination with the default truck. No arguments.',
        execute: () => ({ room: roomName(S.room), today: S.today, red_today_pct: Math.round(d.pct_red_now), pots_ready_today_pct: Math.round(d.sellable_share_now * 100),
          fruit_stops_growing: d.weight_complete_day, best_profit_day_local: d.best_day, default_truck: { temp_c: idx.truck.temp_c, hours_per_day: idx.truck.driving_hours_per_day, speed_kmh: idx.truck.avg_speed_kmh },
          shop_temp_c: idx.truck.shop_temp_c, best_condition_red_pct: idx.truck.best_band_pct_red,
          presets: idx.dests.map((x) => ({ name: x.name, distance_km: x.distance_km, ...summary(Trip.planTrip(fc, d, idx.truck, { distance_km: x.distance_km })) })) }) },
      { name: 'plan_trip', description: 'Works out the pluck day for one trip with the app’s model and shows it on the page. Give distance_km (road distance from Bleiswijk) or transit_days. Returns pluck day, arrival day, ripeness and pots ready on arrival, best days on the shelf, sell-by and warnings.',
        inputSchema: { type: 'object', properties: {
          destination_name: { type: 'string' }, distance_km: { type: 'number' }, transit_days: { type: 'number', description: 'Use for sea or air, or when the grower states it' },
          transit_temp_c: { type: 'number', description: 'Default 13 (refrigerated truck)' }, drivers: { type: 'number', description: '1 or 2' },
          shop_temp_c: { type: 'number' }, min_best_shelf_days: { type: 'number' } }, required: ['destination_name'] },
        execute: (input) => {
          const trip = {};
          for (const k of ['distance_km', 'transit_days', 'transit_temp_c', 'drivers', 'shop_temp_c', 'min_best_shelf_days']) {
            if (input[k] != null && input[k] !== '' && Number.isFinite(Number(input[k]))) trip[k] = Number(input[k]);
          }
          if (trip.distance_km == null && trip.transit_days == null) throw new Error('Give distance_km or transit_days.');
          const plan = Trip.planTrip(fc, d, idx.truck, trip);
          const label = String(input.destination_name || 'Trip').slice(0, 60) + ' (assistant)';
          S.chat.plan = { plan, label };
          const out = $('#trip-out');
          if (out) out.innerHTML = tripHTML(plan, label);
          return summary(plan);
        } },
    ];
  }
  function renderChatLog() {
    const log = $('#chat-log');
    if (!log) return;
    log.innerHTML = '';
    if (!S.chat.turns.length) {
      const p = document.createElement('p');
      p.className = 'chat-empty';
      p.textContent = 'Where are these pots going, and how will they travel?';
      log.append(p);
    }
    for (const t of S.chat.turns) {
      const b = document.createElement('div');
      b.className = 'bubble ' + (t.role === 'user' ? 'me' : 'ai');
      b.textContent = t.content;
      log.append(b);
    }
    log.scrollTop = log.scrollHeight;
  }
  async function setupChat(d, fc) {
    const key = S.room + '|' + S.today;
    if (S.chat.key !== key) { if (S.chat.ctl) S.chat.ctl.abort(); S.chat = { key, turns: [], plan: null, busy: false, ctl: null }; }
    renderChatLog();
    const form = $('#chat-form'), input = $('#chat-input'), send = $('#chat-send'), stop = $('#chat-stop'), note = $('#chat-note');
    const off = (msg) => { input.disabled = true; send.disabled = true; note.textContent = msg; };
    $('#chat-reset').addEventListener('click', () => { if (S.chat.ctl) S.chat.ctl.abort(); S.chat.turns = []; S.chat.plan = null; renderChatLog(); $('#trip-out').innerHTML = ''; });
    stop.addEventListener('click', () => S.chat.ctl && S.chat.ctl.abort());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    const sample = await getSample().catch(() => null);
    if (!$('#chat-form') || S.chat.key !== key) return;            // screen changed while waiting
    if (!sample) { off('The assistant works when Harvest Window is opened as a Claude artifact. Use "Plan your own trip" above meanwhile.'); return; }
    const caps = await sample.limits().catch(() => null);
    if (!caps || !caps.tools) { off('This view cannot run the assistant’s calculator. Use "Plan your own trip" above.'); return; }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || S.chat.busy) return;
      input.value = '';
      S.chat.turns.push({ role: 'user', content: text });
      S.chat.turns = S.chat.turns.slice(-12);
      renderChatLog();
      const log = $('#chat-log');
      const bubble = document.createElement('div');
      bubble.className = 'bubble ai pending';
      bubble.textContent = 'Thinking…';
      log.append(bubble); log.scrollTop = log.scrollHeight;
      S.chat.busy = true; send.disabled = true; stop.hidden = false; note.textContent = '';
      const ctl = new AbortController(); S.chat.ctl = ctl;
      try {
        const { text: answer } = await sample([{ role: 'user', content: chatRules(d) }, ...S.chat.turns], {
          tools: chatTools(d, fc), modelTier: 'quick', signal: ctl.signal,
          onText: ({ text: t }) => { bubble.classList.remove('pending'); bubble.textContent = t; log.scrollTop = log.scrollHeight; } });
        S.chat.turns.push({ role: 'assistant', content: answer });
      } catch (err) {
        if (err && err.text) S.chat.turns.push({ role: 'assistant', content: err.text + ' [interrupted]' });
        if (err && err.code !== 'cancelled') note.textContent = CHAT_ERR[err.code] || 'The assistant is unavailable right now. Try again shortly.';
        if (err && ['not_granted', 'sampling_disabled', 'tools_unavailable', 'not_declared', 'capability_disabled', 'capability_removed'].includes(err.code)) off(note.textContent);
      } finally {
        S.chat.busy = false; S.chat.ctl = null;
        if ($('#chat-send') === send) { send.disabled = input.disabled; stop.hidden = true; renderChatLog(); }
      }
    });
  }

  function profitFinding(d) {
    const tail = d.losses_start_day ? ` From ${day(d.losses_start_day)} each extra day costs more than it earns.` : '';
    return `Profit per m² per day peaks on ${day(d.best_day)} at an estimated ${euro(d.profit_best_m2_day)} (today: ${euro(d.profit_today_m2_day)}).${tail}`;
  }
  function numbersTable(rows, cols) {
    if (!rows.length) return '';
    return `<details class="numbers"><summary>Show the numbers</summary><div class="table-wrap"><table>
      <thead><tr>${cols.map((c, i) => `<th class="${i ? 'r' : ''}">${c[1]}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${cols.map((c, i) => `<td class="${i ? 'r' : ''}">${c[2](r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div></details>`;
  }
  function evidenceBlock(ev, d) {
    if (!ev) return '<p class="muted">No evidence row for this day.</p>';
    const url = photoURL(ev.photo);
    let flag = '';
    if (ev.lamps_on) flag = 'Lamps on: colours tinted purple, not used for ripeness';
    else if (url && !ev.photo_usable) flag = 'Photo not usable for colour today';
    const photo = url
      ? `<div class="photo-box"><img src="${esc(url)}" alt="Noon canopy photo of ${esc(roomName(ev.room))} on ${day(ev.date)}" loading="lazy" onerror="this.parentNode.innerHTML='Photo not available'">${flag ? `<div class="photo-flag">${flag}</div>` : ''}</div>`
      : `<div class="photo-box">No noon photo for ${short(ev.date)}${ev.lamps_on ? '<br>(lamps on)' : ''}</div>`;
    const sample = ev.last_sample_date
      ? `${short(ev.last_sample_date)}: ${pct(ev.last_sample_pct_red)} red, ${ev.last_sample_fw_g == null ? '—' : Math.round(ev.last_sample_fw_g) + ' g'} fruit per pot`
      : 'none yet';
    const v = (x, unit = '') => (x == null ? '—' : x + unit);
    return `<div class="evidence">${photo}
      <dl class="ev">
        <dt>Noon photo</dt><dd>${short(ev.date)} · ${ev.photo_usable ? 'usable' : 'not usable'}${ev.lamps_on == null ? '' : ev.lamps_on ? ' · lamps on' : ' · lamps off'}</dd>
        <dt>Red fruit in photo</dt><dd>${ev.red_index == null ? '—' : (+ev.red_index).toFixed(1) + '% of image'}</dd>
        <dt>Green leaf in photo</dt><dd>${ev.green_pct == null ? '—' : (+ev.green_pct).toFixed(1) + '%'}</dd>
        <dt>Camera to canopy</dt><dd>${ev.canopy_distance_mm == null ? '—' : Math.round(ev.canopy_distance_mm) + ' mm'}</dd>
        <dt>Warmth since planting</dt><dd>${ev.gdd_cum == null ? '—' : Math.round(ev.gdd_cum) + ' degree-days'}</dd>
        <dt>Last crop sample</dt><dd>${sample}</dd>
        <dt>Model used</dt><dd>${esc(MODEL[d.model] || d.model)}</dd>
      </dl></div>
      <p class="caption">Degree-days: each day adds its average temperature above the crop's base temperature. Lamp-lit photos are purple, so colour is read only from daylight photos. Source: evidence.json.</p>`;
  }
  function updateWhatif(d, area) {
    const dc = S.delta;
    $('#delta-val').textContent = (dc > 0 ? '+' : dc < 0 ? '−' : '±') + Math.abs(dc).toFixed(1) + ' °C';
    const w = idx.whatif.get(S.room + '|' + S.today + '|' + dc);
    const out = $('#wi-out');
    if (!w) { out.innerHTML = '<p class="muted">No what-if result for this day.</p>'; return; }
    const shift = w.days_change === 0 ? 'no change' : `${plural(Math.abs(w.days_change), 'day')} ${w.days_change < 0 ? 'earlier' : 'later'}`;
    const fit = (S.data.whatif.meta.heating_fit_by_today || {})[S.today] || S.data.whatif.meta.heating_fit;   // the fit used for today's numbers
    out.innerHTML = `
      <p class="finding">${dc === 0 ? 'Move the slider to see the estimated effect.' : `Running ${Math.abs(dc).toFixed(1)} °C ${dc > 0 ? 'warmer' : 'cooler'} moves the best day to ${day(w.best_day)} (${shift}).`}</p>
      <div class="wi-out">
        <div class="part"><div class="part-k">New best day</div><div class="part-v">${short(w.best_day)}</div><div class="part-s">${shift}</div></div>
        <div class="part"><div class="part-k">Profit change</div><div class="part-v">${signedEuro(w.profit_change_m2_day, 3)}</div><div class="part-s">per m² per day grown (now ${euro(w.profit_best_m2_day)})</div></div>
        <div class="part"><div class="part-k">Extra heating</div><div class="part-v">${signedEuro(w.extra_energy_cost_m2_day, 3)}</div><div class="part-s">per m² per day${area ? ` · ${signedEuro(w.extra_energy_cost_m2_day * area)} per day for this room` : ''}</div></div>
      </div>
      <p class="note">${esc([S.data.whatif.meta.note, w.note].filter(Boolean).join(' '))}${fit && fit.r2 != null ? ` Heating cost per °C: a rough, probably low estimate from ${fit.n} heated room-days (fit quality ${(+fit.r2).toFixed(2)}, weak).` : ''}</p>`;
  }

  /* ---------- charts ---------- */
  function frame(el, h, top) {
    el.innerHTML = '';
    const W = Math.max(280, el.clientWidth);
    const m = { top: top, right: 14, bottom: 26, left: 46 };
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', h).attr('role', 'img');
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    return { svg, g, w: W - m.left - m.right, h: h - m.top - m.bottom, W };
  }
  function xAxis(f, x) {
    const n = Math.max(3, Math.floor(f.w / 70));
    f.g.append('g').attr('class', 'axis').attr('transform', `translate(0,${f.h})`)
      .call(d3.axisBottom(x).ticks(Math.min(n, 8)).tickFormat(fmtShort).tickSizeOuter(0));
  }
  function yAxis(f, y, fmt) {
    f.g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-f.w).tickFormat(''));
    f.g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(fmt).tickSizeOuter(0));
  }
  /* Vertical markers with labels stacked in rows above the plot so they never overlap. */
  function vmarks(f, x, marks, maxRows) {
    // Greedy placement: each label takes the lowest row where it overlaps no other label and no other
    // marker's line crosses it (a line reaches up to its own label's row).
    // Labels point away from the nearest other marker, and flip side if that side is taken.
    const inDomain = marks.filter((m) => m.date && parse(m.date) >= x.domain()[0] && parse(m.date) <= x.domain()[1])
      .map((m) => Object.assign({}, m, { px: x(parse(m.date)) }));
    const placed = [];
    inDomain.forEach((m) => {
      const px = m.px;
      const others = inDomain.filter((o) => o !== m && Math.abs(o.px - px) > 0.5);
      const near = others.length ? others.reduce((a, o) => (Math.abs(o.px - px) < Math.abs(a.px - px) ? o : a)) : null;
      let prefEnd = near ? near.px > px : px > f.w * 0.6;
      const t = f.g.append('text').attr('class', 'mlabel ' + (m.cls || '')).text(m.label);
      const w = t.node().getComputedTextLength();
      if (prefEnd && px - 4 - w < -40) prefEnd = false;
      if (!prefEnd && px + 4 + w > f.w + 12) prefEnd = true;
      const span = (end) => (end ? [px - 4 - w, px - 4] : [px + 4, px + 4 + w]);
      const fits = (end) => { const [a, b] = span(end); return a >= -40 && b <= f.w + 12; };
      const cost = (row, end) => {
        const [a, b] = span(end);
        return (fits(end) ? 0 : 50) + placed.reduce((n, p) => n
          + (p.row === row && a < p.b + 4 && b > p.a - 4 ? 10 : 0)       // label on label (worst)
          + (p.row >= row && p.px >= a - 2 && p.px <= b + 2 ? 1 : 0)      // their line through my label
          + (p.row < row && px >= p.a - 2 && px <= p.b + 2 ? 1 : 0), 0);  // my line through their label
      };
      let pick = null, best = Infinity;
      for (let row = 0; row < maxRows; row++) {
        for (const end of [prefEnd, !prefEnd]) {
          const c = cost(row, end) + row * 0.01;
          if (c < best) { best = c; pick = [row, end]; }
        }
      }
      const [row, end] = pick;
      const [a, b] = span(end);
      placed.push({ px, a, b, row });
      t.attr('text-anchor', end ? 'end' : 'start').attr('x', px + (end ? -4 : 4)).attr('y', -7 - row * 14);
      f.g.insert('line', () => t.node()).attr('class', 'vmark ' + (m.cls || '')).attr('x1', px).attr('x2', px).attr('y1', -4 - row * 14).attr('y2', f.h);
    });
  }
  function hover(f, x, rows, html, yFor) {
    const xh = f.g.append('line').attr('class', 'xhair').attr('y1', 0).attr('y2', f.h).style('display', 'none');
    const dot = f.g.append('circle').attr('class', 'hdot').attr('r', 4).style('display', 'none');
    const bis = d3.bisector((r) => parse(r.date)).center;
    f.g.append('rect').attr('width', f.w).attr('height', f.h).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [mx] = d3.pointer(ev);
        const r = rows[bis(rows, x.invert(mx))];
        if (!r) return;
        const px = x(parse(r.date));
        xh.attr('x1', px).attr('x2', px).style('display', null);
        const y = yFor(r);
        if (y != null) dot.attr('cx', px).attr('cy', y).style('display', null); else dot.style('display', 'none');
        tip.innerHTML = html(r);
        tip.hidden = false;
        const bx = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
        tip.style.left = Math.max(8, bx) + 'px';
        tip.style.top = Math.max(8, ev.clientY - tip.offsetHeight - 12) + 'px';
      })
      .on('pointerleave', () => { xh.style('display', 'none'); dot.style('display', 'none'); tip.hidden = true; });
  }
  function drawProfit(el, fc, d, meta) {
    if (!fc.length) { el.innerHTML = '<p class="muted">No forecast rows.</p>'; return; }
    const f = frame(el, 320, 80);
    const x = d3.scaleUtc().domain(d3.extent(fc, (r) => parse(r.date))).range([0, f.w]);
    const lo = d3.min(fc, (r) => r.profit_low), hi = d3.max(fc, (r) => r.profit_high);
    const y = d3.scaleLinear().domain([Math.min(0, lo), hi]).nice().range([f.h, 0]);
    xAxis(f, x);
    yAxis(f, y, (v) => euro(v));
    if (y.domain()[0] < 0) f.g.append('line').attr('class', 'zero').attr('x1', 0).attr('x2', f.w).attr('y1', y(0)).attr('y2', y(0));
    // likely best-day range
    const r0 = parse(d.best_day_low), r1 = d3.utcDay.offset(parse(d.best_day_high), 0);
    f.g.append('rect').attr('class', 'range').attr('x', x(r0)).attr('width', Math.max(2, x(r1) - x(r0))).attr('y', 0).attr('height', f.h);
    f.g.append('path').attr('class', 'band').attr('d', d3.area().x((r) => x(parse(r.date))).y0((r) => y(r.profit_low)).y1((r) => y(r.profit_high))(fc));
    f.g.append('path').attr('class', 'line').attr('d', d3.line().x((r) => x(parse(r.date))).y((r) => y(r.profit_m2_day))(fc));
    const wi = S.delta ? idx.whatif.get(S.room + '|' + S.today + '|' + S.delta) : null;
    vmarks(f, x, [
      { date: d.best_day, label: 'Best day', cls: 'best' },
      { date: wi && wi.best_day !== d.best_day ? wi.best_day : null, label: 'What-if best', cls: 'whatif' },
      { date: d.earliest_sellable_day, label: 'Earliest sellable' },
      { date: d.losses_start_day, label: 'Losses start' },
      { date: meta.actual_harvest, label: 'Grower harvested', cls: 'actual' },
    ], 5);
    hover(f, x, fc, (r) => `<b>${day(r.date)}</b><br><span class="tk">Profit</span> ${euro(r.profit_m2_day)} <span class="tk">(${euro(r.profit_low)} to ${euro(r.profit_high)})</span><br><span class="tk">Pots ready to sell</span> ${share(r.sellable_share)}<br><span class="tk">Cost so far</span> ${euro(r.cost_to_date_m2)} per m²`, (r) => y(r.profit_m2_day));
    f.svg.attr('aria-label', profitFinding(d));
  }
  function drawRipe(el, fc, d, meta) {
    const past = (idx.daysByRoom.get(S.room) || []).filter((r) => r.today <= S.today).map((r) => ({ date: r.today, pct_red: r.pct_red_now, pct_red_low: r.pct_red_low, pct_red_high: r.pct_red_high }));
    const samples = [];
    const seen = new Set();
    (idx.evidenceByRoom.get(S.room) || []).forEach((e) => {
      if (e.last_sample_date && e.last_sample_date <= S.today && !seen.has(e.last_sample_date) && e.last_sample_pct_red != null) {
        seen.add(e.last_sample_date);
        samples.push({ date: e.last_sample_date, pct: e.last_sample_pct_red });
      }
    });
    const start = d3.min([past.length ? past[0].date : S.today, ...samples.map((s) => s.date)]);
    const end = fc.length ? fc[fc.length - 1].date : S.today;
    const f = frame(el, 300, 38);
    const x = d3.scaleUtc().domain([parse(start), parse(end)]).range([0, f.w]);
    const y = d3.scaleLinear().domain([0, 100]).range([f.h, 0]);
    xAxis(f, x);
    yAxis(f, y, (v) => v + '%');
    const all = past.slice(0, -1).concat(fc);
    f.g.append('path').attr('class', 'band').attr('d', d3.area().x((r) => x(parse(r.date))).y0((r) => y(r.pct_red_low)).y1((r) => y(r.pct_red_high))(fc));
    if (past.length > 1) f.g.append('path').attr('class', 'line past').attr('d', d3.line().x((r) => x(parse(r.date))).y((r) => y(r.pct_red))(past));
    f.g.append('path').attr('class', 'line').attr('d', d3.line().x((r) => x(parse(r.date))).y((r) => y(r.pct_red))(fc));
    f.g.selectAll('.sample').data(samples).join('circle').attr('class', 'sample').attr('r', 5)
      .attr('cx', (s) => x(parse(s.date))).attr('cy', (s) => y(s.pct));
    vmarks(f, x, [
      { date: S.today, label: 'Today', cls: 'today' },
      { date: meta.actual_harvest, label: 'Grower harvested', cls: 'actual' },
    ], 2);
    const sampleOn = new Map(samples.map((s) => [s.date, s.pct]));
    hover(f, x, all, (r) => `<b>${day(r.date)}</b>${r.date > S.today ? ' (forecast)' : r.date < S.today ? ' (estimate made that day)' : ' (today)'}<br><span class="tk">Fruit red</span> ${pct(r.pct_red)} <span class="tk">(${pct(r.pct_red_low)}–${pct(r.pct_red_high)})</span>${sampleOn.has(r.date) ? `<br><span class="tk">Crop sample</span> ${pct(sampleOn.get(r.date))}` : ''}`, (r) => y(r.pct_red));
    f.svg.attr('aria-label', `Ripeness: about ${pct(d.pct_red_now)} red today`);
  }

  /* ---------- screen 3: alerts ---------- */
  function renderAlerts() {
    const c = customer();
    const list = idx.alerts.filter((a) => c.rooms.includes(a.room) && a.date <= S.today);
    const recent = recentAlerts(c.rooms).length;
    main.innerHTML = `
      <div class="page-head"><h1>Alerts</h1>
        <p class="lede">${plural(recent, 'alert')} in the last ${ALERT_DAYS} days up to ${day(S.today)}, across the rooms at ${esc(c.name)}. Older ones are listed below for the record.</p></div>
      ${list.length ? `<ul class="alert-list">${list.map(alertItem).join('')}</ul>` : '<p class="empty">No alerts up to this day.</p>'}
      <p class="caption">Kinds: behind or ahead of schedule (photo or crop sample outside the forecast range), sensor check (missing, flat or out-of-range readings), room drifting (gaining warmth much slower than the other rooms). Disease detection is not in this version. Source: alerts.json.</p>`;
  }
  function alertItem(a) {
    const nums = Object.entries(a.numbers || {}).map(([k, v]) => `${esc(humanKey(k))}: <b>${esc(v)}</b>`).join(' · ');
    const old = a.date < addDays(S.today, -(ALERT_DAYS - 1));
    return `<li class="card alert"${old ? ' style="opacity:.7"' : ''}>
      <div class="sev ${a.severity}" aria-label="${a.severity}">${a.severity === 'warning' ? '!' : 'i'}</div>
      <div><div class="alert-meta"><a href="${hashFor({ view: 'room', room: a.room })}">${esc(roomName(a.room))}</a> · ${day(a.date)} · ${a.severity === 'warning' ? 'Warning' : 'For information'}</div>
        <h3>${esc(a.title)}</h3><p>${esc(a.message)}</p>${nums ? `<div class="alert-nums">${nums}</div>` : ''}</div></li>`;
  }

  /* ---------- screen 4: how it works & limits ---------- */
  function renderHow() {
    const bt = S.data.backtest;
    const tests = d3.group(bt.rows, (r) => r.test);
    const btHTML = [...tests].map(([test, rows]) => {
      const best = d3.min(rows, (r) => r.value);   // lower "days off" / "points off" is better
      return `<h3>${esc(test === 'timing' ? 'Harvest timing' : test === 'ripeness' ? 'Ripeness on harvest day' : test)}</h3>
        <div class="table-wrap"><table><thead><tr><th>Method</th><th class="r">Error</th><th>Unit</th><th class="r">Rooms</th><th>Note</th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${r.value === best ? 'win' : ''}"><td>${esc(r.method)} ${r.value === best ? '<span class="tag win">better</span>' : ''}</td><td class="r">${esc(r.value)}</td><td>${esc(r.unit)}</td><td class="r">${esc(r.n)}</td><td>${esc(r.note)}</td></tr>`).join('')}
        </tbody></table></div>`;
    }).join('');
    const per = (bt.meta.per_room || []);
    const perHTML = per.length ? `<details class="numbers"><summary>Per room</summary><div class="table-wrap"><table><thead><tr><th>Room</th><th>Method</th><th>Predicted</th><th>Actual</th><th class="r">Days off</th></tr></thead><tbody>
      ${per.map((r) => `<tr><td>${esc(roomName(r.room))} <span class="muted small">(${esc(r.room)})</span></td><td>${esc(r.method)}</td><td>${typeof r.predicted === 'string' && /^\d{4}-/.test(r.predicted) ? short(r.predicted) : esc(r.predicted)}</td><td>${typeof r.actual === 'string' && /^\d{4}-/.test(r.actual) ? short(r.actual) : esc(r.actual)}</td><td class="r">${esc(r.error)}</td></tr>`).join('')}
      </tbody></table></div></details>` : '';
    const asm = S.data.assumptions.rows;
    main.innerHTML = `
      <div class="page-head"><h1>How it works &amp; limits</h1>
        <p class="lede">The app replays a real greenhouse trial day by day, as if it were live. For each room it estimates how ripe the fruit is, when picking pays best, and how sure it is. The ripening curve is learned on the other rooms, using only data up to "today"; once this room has a crop sample, the curve is nudged toward it.</p></div>
      <section class="section"><h2>The logic in plain words</h2>
        <ol class="steps">
          <li><b>Warmth clock.</b> Tomatoes ripen with accumulated warmth. Each day adds its average temperature above a base temperature ("degree-days"). A ripening curve learned on the other rooms turns warmth into % of fruit that is red.</li>
          <li><b>Camera check.</b> A daylight noon photo shows when red fruit first appears. That anchors the curve for this room. Lamp-lit photos are purple and are skipped.</li>
          <li><b>Crop samples.</b> When growers weigh a few plants, the curve is pulled towards what they found.</li>
          <li><b>Pots ready to sell.</b> Pots in a room ripen at different speeds. From the spread between plants we estimate the share of pots that would sell on each day.</li>
          <li><b>Harvest window.</b> Using the challenge's scoring rules (checked against Maree et al. 2025), we estimate profit per m² per day grown for each of the coming days: earliest sellable day, best day, and the day losses start.</li>
          <li><b>How sure we are.</b> The weakest of three checks: how wide the best-day range is, whether warmth, camera and sample agree, and how fresh the evidence is.</li>
        </ol></section>
      <section class="card section"><h2>Timing test: how good is it, honestly?</h2>
        <p class="muted">Each room is forecast as if we did not know its hand measurements, then compared with what really happened. We report simple baselines next to our model, including where a baseline does better. Lower error is better.</p>
        ${btHTML}${perHTML}
        <p class="caption">Source: backtest.json.</p></section>
      <section class="card section"><h2>Assumptions</h2>
        <p class="muted">Every setting the numbers depend on, where it comes from, and what changes if it is wrong.</p>
        <div class="table-wrap"><table><thead><tr><th>Assumption</th><th class="r">Value</th><th>Source</th><th>If it is wrong</th></tr></thead><tbody>
        ${asm.map((a) => `<tr><td>${esc(a.name)}</td><td class="r">${esc(a.value)}${a.unit ? ' ' + esc(a.unit) : ''}</td><td>${esc(a.source)}</td><td>${esc(a.if_wrong)}</td></tr>`).join('')}
        </tbody></table></div><p class="caption">Source: assumptions.json (built from config/crop.yaml; details in docs/assumptions.md).</p></section>
      <section class="card section"><h2>Limits</h2>
        <ul class="limits">
          <li>${plural(idx.rooms.size, 'room')}, one autumn, one site, one variety, and only a few hand measurements per room. Patterns are associations, not proof.</li>
          <li>The camera sees the top of the canopy and part of one table; lamp-lit photos are unusable for colour.</li>
          <li>Fruit dry matter (part of the real price) is not in the data, and harvest labour is not costed.</li>
          <li>The temperature what-if assumes ripening follows warmth; it was not tested by changing a greenhouse.</li>
          <li>Profit on days other than the actual harvest is a model estimate: each room was harvested once.</li>
          <li>Customer names are fictional. Each "customer" is two rooms of the same research trial.</li>
        </ul></section>
      <section class="card section"><h2>Data and credits</h2>
        <ul class="limits">
          <li>Dataset: 4th Autonomous Greenhouse Challenge, dwarf tomato (Maree et al., 4TU.ResearchData), licence CC BY 4.0. Climate logs, outside weather, canopy photos and hand measurements.</li>
          <li>Builds on our team's earlier work: ripening curve, photo onset and profit model from the main project (Prathamesh Mulay); crop-sample check and mean-baseline ideas from the HarvestWindow planner (Chaitanya Nirantar). Scoring rules: Maree et al. 2025, Sensors 25:4321.</li>
          <li>Built for the UIUC CDA Precision &amp; Digital Agriculture Hackathon (Track 1, Challenge 2).</li>
        </ul></section>`;
  }

  /* ---------- router ---------- */
  function render() {
    tip.hidden = true;
    syncControls();
    if (S.view === 'room') renderRoom();
    else if (S.view === 'alerts') renderAlerts();
    else if (S.view === 'how') renderHow();
    else renderHome();
  }

  load().catch((e) => {
    main.innerHTML = `<p class="empty">Could not load the app data (${esc(e.message)}). Run <code>make build</code> or serve the app folder with <code>make app</code>.</p>`;
    throw e;
  }).then(() => {
    readHash();
    initControls();
    if (!location.hash) history.replaceState(null, '', hashFor());
    render();
  }).catch((e) => {
    if (main.querySelector('.empty')) return;
    main.innerHTML = `<p class="empty">Something went wrong drawing this screen (${esc(e.message)}).</p>`;
    console.error(e);
  });
})();
