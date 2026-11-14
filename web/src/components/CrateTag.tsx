/* Crate tag (room card): who and what, then one big fact (the best day), then the evidence (ripeness + stamp).
 * DESIGN.md → Components → Crate tag. The whole tag is one link to the room. */
import type { RoomState } from '../data/store';
import { DASH, diffDays, span, tagDate } from '../data/format';
import { LEVEL, STATUS } from '../lib/words';
import { RipenessBar, Stamp } from './basics';

export interface CrateTagProps {
  state: RoomState;
  name: string;
  today: string;
  alerts: number;
  href: string;
}

/** "IN 5 DAYS", "TODAY", "TOMORROW", "2 DAYS AGO". */
export function timingStamp(today: string, date: string | null | undefined): string {
  if (!date) return DASH;
  const n = diffDays(today, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

export function CrateTag({ state, name, today, alerts, href }: CrateTagProps) {
  if (state.kind === 'harvested') {
    return (
      <a className="ctag ctag-harvested" href={href} aria-label={`${name}: harvested`}>
        <div className="ctag-b">
          <div className="micro">{name} · dwarf tomato</div>
          <div className="ctag-status">Harvested</div>
        </div>
        <div className="ctag-b">
          <div className="micro">What the grower actually did</div>
          <div className="ctag-date">{tagDate(state.meta.actual_harvest)}</div>
          <div className="micro-line">See the replay ›</div>
        </div>
        <div className="ctag-b ctag-row">
          <span className="micro">Picked</span>
          <Stamp tone="muted">{timingStamp(today, state.meta.actual_harvest)}</Stamp>
        </div>
      </a>
    );
  }
  if (state.kind === 'none') {
    return (
      <div className="ctag">
        <div className="ctag-b"><div className="micro">{name} · dwarf tomato</div><div className="ctag-status">No forecast</div></div>
        <div className="ctag-b"><p className="caption">No forecast for this day.</p></div>
      </div>
    );
  }
  const d = state.d;
  const st = STATUS[d.status];
  return (
    <a className={`ctag status-${d.status}`} href={href} aria-label={`${name}: ${st.label}, best harvest day ${tagDate(d.best_day)}`}>
      <div className="ctag-b">
        <div className="ctag-top">
          <span className="micro">{name} · dwarf tomato</span>
          {alerts > 0 && <span className="ctag-alerts">{alerts} alert{alerts === 1 ? '' : 's'}</span>}
        </div>
        <div className="ctag-status">{st.label}</div>
      </div>
      <div className="ctag-b">
        <div className="micro">Best harvest day</div>
        <div className="ctag-date">{tagDate(d.best_day)}</div>
        <div className="micro-line">likely {span(d.best_day_low, d.best_day_high)} · how sure: {LEVEL[d.confidence]?.toLowerCase() ?? DASH}</div>
      </div>
      <div className="ctag-b ctag-row">
        <RipenessBar pctRed={d.pct_red_now} size="small" />
        <Stamp tone={d.status}>{timingStamp(today, d.best_day)}</Stamp>
      </div>
    </a>
  );
}
