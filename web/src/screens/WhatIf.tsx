/* Temperature what-if: a slider over the published delta_c values; every number from whatif.json. */
import { useApp } from '../context';
import type { DayCard } from '../data/types';
import { day, euro, plural, short, signedC, signedEuro } from '../data/format';

export function WhatIf({ room, d, area, delta, setDelta }: { room: string; d: DayCard; area: number | null; delta: number; setDelta: (v: number) => void }) {
  const { store, route } = useApp();
  const ds = store.deltas;
  if (!ds.length) return null;
  const stepSize = ds.length > 1 ? ds[1] - ds[0] : 1;
  const w = store.whatif(room, route.t, delta);
  const fit = store.heatingFit(route.t);
  const note = store.data.whatif.meta.note;
  const shift = !w ? '—' : w.days_change === 0 ? 'no change' : `${plural(Math.abs(w.days_change), 'day')} ${w.days_change < 0 ? 'earlier' : 'later'}`;
  return (
    <section className="card section" id="whatif">
      <h2>What if the room ran warmer or cooler?</h2>
      <p className="caption">Change the room's average temperature from today on. Warmer rooms ripen faster but use more heating.</p>
      <div className="whatif-ctl">
        <label htmlFor="delta" className="micro">Temperature change</label>
        <input type="range" id="delta" min={ds[0]} max={ds[ds.length - 1]} step={stepSize} value={delta}
          onChange={(e) => setDelta(Number(e.target.value))} aria-describedby="wi-out" />
        <output className="whatif-val" htmlFor="delta">{signedC(delta)}</output>
        <div className="scale" aria-hidden="true"><span>cooler</span><span>as now</span><span>warmer</span></div>
      </div>
      <div id="wi-out" aria-live="polite">
        {!w ? <p className="muted">No what-if result for this day.</p> : (
          <>
            <p className="finding">{delta === 0 ? 'Move the slider to see the estimated effect.'
              : `Running ${Math.abs(delta).toFixed(1)} °C ${delta > 0 ? 'warmer' : 'cooler'} moves the best day to ${day(w.best_day)} (${shift}).`}</p>
            <div className="parts">
              <div className="part"><div className="micro">New best day</div><div className="part-v">{short(w.best_day)}</div><div className="caption">{shift} (now {short(d.best_day)})</div></div>
              <div className="part"><div className="micro">Profit change</div><div className="part-v">{signedEuro(w.profit_change_m2_day, 3)}</div><div className="caption">per m² per day grown (now {euro(w.profit_best_m2_day)})</div></div>
              <div className="part"><div className="micro">Extra heating</div><div className="part-v">{signedEuro(w.extra_energy_cost_m2_day, 3)}</div>
                <div className="caption">per m² per day{area && w.extra_energy_cost_m2_day != null ? ` · ${signedEuro(w.extra_energy_cost_m2_day * area)} per day for this room` : ''}</div></div>
            </div>
            <p className="note">{[note, w.note].filter(Boolean).join(' ')}
              {fit && fit.r2 != null ? ` Heating cost per °C: a rough, probably low estimate from ${fit.n} heated room-days (fit quality ${Number(fit.r2).toFixed(2)}, weak).` : ''}</p>
          </>
        )}
      </div>
    </section>
  );
}
