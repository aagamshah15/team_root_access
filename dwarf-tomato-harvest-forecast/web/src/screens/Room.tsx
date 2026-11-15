/* Screen 2: one room. Hero (best day + harvest day strip + three harvest points) → KPI tiles → charts →
 * shipping → evidence → what-if. Desktop: charts and shipping left, confidence, evidence and what-if right. */
import { useCallback, useMemo, useState } from 'react';
import { useApp } from '../context';
import type { DayCard, ForecastRow, KpiId, Room } from '../data/types';
import { day, diffDays, euro, long, pct, plural, rel, share, span, tagDate } from '../data/format';
import { LEVEL, STATUS, AGREE } from '../lib/words';
import { buildExplainer } from '../lib/explain';
import { RipenessBar, StatusPill, Stamp, NumbersTable } from '../components/basics';
import { HarvestDayStrip } from '../components/HarvestDayStrip';
import { KpiTile, ExplainerDrawer } from '../components/Explainer';
import { FieldLogEntry } from '../components/FieldLogEntry';
import { timingStamp } from '../components/CrateTag';
import { ProfitChartSlot, RipenessChartSlot, SellableProfitSlot } from '../slots';
import { ShippingSection } from './ShippingSection';
import { WhatIf } from './WhatIf';

/** Remembered across rooms during a visit (not stored). */
let lastDest: string | null = null;

export function RoomScreen({ room }: { room: string }) {
  const { store, route, href } = useApp();
  const st = store.roomState(room, route.t);
  const back = <a className="back" href={href({ view: 'home', room: null })}>← My greenhouses</a>;
  if (st.kind !== 'live') {
    const last = st.meta?.actual_harvest ? store.history(room, st.meta.actual_harvest).filter((r) => r.today < st.meta!.actual_harvest!).pop() : undefined;
    return (
      <>
        {back}
        <div className="page-head">
          <h1>{store.roomName(room)}</h1>
          <p className="lede">{st.kind === 'harvested'
            ? <>This room was harvested on <b>{day(st.meta.actual_harvest)}</b> (what the grower actually did).</>
            : <>No forecast for {day(route.t)}.</>}</p>
          {last && <p><a href={href({ t: last.today })}>Go back to {day(last.today)}, the last day before harvest →</a></p>}
        </div>
      </>
    );
  }
  return <LiveRoom room={room} d={st.d} meta={st.meta} back={back} />;
}

function LiveRoom({ room, d, meta, back }: { room: string; d: DayCard; meta: Room | undefined; back: React.ReactNode }) {
  const { store, route, photoUrl } = useApp();
  const today = route.t;
  const fc = store.forecast(room, today);
  const [dest, setDestState] = useState<string | null>(() => lastDest ?? store.defaultDestination());
  const setDest = (id: string) => { lastDest = id; setDestState(id); };
  const [delta, setDelta] = useState(0);
  const [kpi, setKpi] = useState<KpiId | null>(null);
  const destination = store.destinations.find((x) => x.id === dest) ?? null;
  const ship = dest ? store.ship(room, today, dest) : undefined;
  const shipDay = ship?.pluck_day ?? null;
  const wi = delta ? store.whatif(room, today, delta) : undefined;
  const ev = store.evidence(room, today);
  const closeKpi = useCallback(() => setKpi(null), []);
  const explainer = useMemo(
    () => (kpi ? buildExplainer(kpi, kpi === 'ship_day' && dest !== store.defaultDestination() ? undefined : store.explain(room, today, kpi), d, store.data.assumptions.rows, ship, destination?.name ?? null) : null),
    [kpi, store, room, today, d, ship, destination, dest],
  );
  const atEdge = fc.length > 0 && d.best_day === fc[fc.length - 1].date;
  const planted = meta?.planted ?? null;
  const name = store.roomName(room);

  return (
    <>
      {back}
      <section className="hero card" aria-labelledby="room-title">
        <div className="hero-top">
          <div>
            <div className="micro">
              <span id="room-title">{name}</span> · dwarf tomato{planted ? ` · planted ${long(planted)} · day ${diffDays(planted, today)}` : ''}
            </div>
            <div className="hero-k">Best harvest day</div>
            <div className="hero-date">{tagDate(d.best_day)}</div>
            <div className="hero-s">
              {rel(today, d.best_day)}{d.best_day_low && d.best_day_high && d.best_day_low !== d.best_day_high ? ` · likely ${span(d.best_day_low, d.best_day_high)}` : ''}
              {atEdge ? ' · at the end of the forecast, so it may be later' : ''}
            </div>
            <button type="button" className="link" onClick={() => setKpi('best_day')}>How is this worked out? ›</button>
          </div>
          <div className="verdict">
            <StatusPill status={d.status} />
            <p className="verdict-text">{STATUS[d.status].verdict}</p>
            <Stamp tone={d.status}>{timingStamp(today, d.best_day)}</Stamp>
          </div>
        </div>
        <HarvestDayStrip rows={fc} day={d} today={today} shipDay={shipDay} shipLabel={destination?.name ?? null} zoneShare={store.zoneShare()}
          onPin={(id) => setKpi(id === 'ship' ? 'ship_day' : id === 'look' ? 'look_day' : 'best_day')} />
      </section>

      <div className="kpis" role="group" aria-label="Key numbers">
        <KpiTile label="Pots ready now" value={share(d.sellable_share_now)} sub={`fruit ${pct(d.pct_red_now)} red today`} onExplain={() => setKpi('pots_ready')} />
        <KpiTile label="Profit at best day" value={euro(d.profit_best_m2_day)} sub="per m² per day grown" onExplain={() => setKpi('profit_best')} />
        <KpiTile label="How sure we are" value={LEVEL[d.confidence] ?? '—'} sub="weakest of 3 checks" onExplain={() => setKpi('confidence')} linkText="See why ›" />
      </div>

      <div className="room-grid">
        <div className="col-main">
          <section className="card section">
            <h2>Harvest window</h2>
            <ProfitChartSlot rows={fc} day={d} shipDay={shipDay} shipLabel={destination?.name ?? null}
              actualHarvest={meta?.actual_harvest ?? null} whatIfBestDay={wi && wi.best_day !== d.best_day ? wi.best_day : null}
              onDetails={() => setKpi('profit_best')}
              fallback={<><p className="finding">{profitFinding(d)}</p><ProfitTable fc={fc} /></>} />
          </section>
          <section className="card section">
            <h2>Pots ready to sell and profit</h2>
            <SellableProfitSlot rows={fc} day={d} sellableTarget={store.truck?.earliest_sellable_share ?? null} />
          </section>
          <section className="card section">
            <h2>Ripeness</h2>
            <RipenessBar pctRed={d.pct_red_now} />
            <RipenessChartSlot rows={fc} day={d} history={store.history(room, today)} samples={store.samples(room, today)}
              today={today} actualHarvest={meta?.actual_harvest ?? null}
              fallback={<RipeTable fc={fc} />} />
          </section>
          {store.destinations.length > 0 && store.truck && (
            <ShippingSection room={room} d={d} fc={fc} dest={dest} setDest={setDest} onExplain={() => setKpi('ship_day')} />
          )}
        </div>
        <div className="col-side">
          <section className="card section">
            <h2>How sure we are: {LEVEL[d.confidence] ?? '—'}</h2>
            <p className="caption">The level is the weakest of three checks.</p>
            <dl className="checks">
              <div><dt>Day range</dt><dd>{plural(d.conf_day_range_days, 'day')}{d.conf_day_range_level && <span className={`lvl lvl-${d.conf_day_range_level}`}>{LEVEL[d.conf_day_range_level]}</span>}</dd></div>
              <div><dt>Evidence agreement</dt><dd>{AGREE[d.conf_agreement]?.[0] ?? '—'}{d.conf_agreement_level && <span className={`lvl lvl-${d.conf_agreement_level}`}>{LEVEL[d.conf_agreement_level]}</span>}</dd></div>
              <div><dt>Freshness</dt><dd>{plural(d.conf_freshness_days, 'day')}{d.conf_freshness_level && <span className={`lvl lvl-${d.conf_freshness_level}`}>{LEVEL[d.conf_freshness_level]}</span>}</dd></div>
            </dl>
            {d.conf_reasons?.length > 0 && <ul className="reasons">{d.conf_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
            <p className="caption">Source: days.json.</p>
          </section>
          <section className="card section">
            <h2>Today's evidence</h2>
            {ev ? <FieldLogEntry ev={ev} d={d} roomName={name} photoUrl={photoUrl} /> : <p className="muted">No evidence row for this day.</p>}
            <EarlierLog room={room} today={today} name={name} />
            <p className="caption">Degree-days: each day adds its average temperature above the crop's base temperature. Lamp-lit photos are purple, so colour is read only from daylight photos. Source: evidence.json.</p>
          </section>
          <WhatIf room={room} d={d} area={meta?.area_m2 ?? null} delta={delta} setDelta={setDelta} />
        </div>
      </div>
      <ExplainerDrawer ex={explainer} onClose={closeKpi} />
    </>
  );
}

function profitFinding(d: DayCard): string {
  const tail = d.losses_start_day ? ` From ${day(d.losses_start_day)} each extra day costs more than it earns.` : '';
  return `Profit per m² per day peaks on ${day(d.best_day)} at an estimated ${euro(d.profit_best_m2_day)} (today: ${euro(d.profit_today_m2_day)}).${tail}`;
}

function ProfitTable({ fc }: { fc: ForecastRow[] }) {
  return <NumbersTable rows={fc} cols={[
    { key: 'date', label: 'Day', get: (r) => day(r.date) },
    { key: 'lo', label: 'Low €', get: (r) => euro(r.profit_low, 3), right: true },
    { key: 'p', label: 'Expected €', get: (r) => euro(r.profit_m2_day, 3), right: true },
    { key: 'hi', label: 'High €', get: (r) => euro(r.profit_high, 3), right: true },
    { key: 's', label: 'Pots ready', get: (r) => share(r.sellable_share), right: true },
  ]} />;
}
function RipeTable({ fc }: { fc: ForecastRow[] }) {
  return <NumbersTable rows={fc} cols={[
    { key: 'date', label: 'Day', get: (r) => day(r.date) },
    { key: 'lo', label: 'Low', get: (r) => pct(r.pct_red_low), right: true },
    { key: 'p', label: 'Expected % red', get: (r) => pct(r.pct_red), right: true },
    { key: 'hi', label: 'High', get: (r) => pct(r.pct_red_high), right: true },
  ]} />;
}

function EarlierLog({ room, today, name }: { room: string; today: string; name: string }) {
  const { store, photoUrl } = useApp();
  const earlier = store.evidenceTrail(room, today, 7).slice(1);
  if (!earlier.length) return null;
  return (
    <details className="numbers">
      <summary>Earlier entries ({earlier.length})</summary>
      <div className="log-stack">{earlier.map((e) => <FieldLogEntry key={e.date} ev={e} roomName={name} photoUrl={photoUrl} />)}</div>
    </details>
  );
}
