/* Screen 3: Alerts across the customer's rooms, newest first, each with its reason and the numbers behind it. */
import { useApp } from '../App';
import { addDays, day, humanKey, plural } from '../data/format';
import { ALERT_DAYS } from '../data/store';
import type { AlertRow } from '../data/types';

export function Alerts() {
  const { store, route, href } = useApp();
  const c = store.customer(route.c);
  const rooms = c?.rooms ?? [];
  const list = store.alerts.filter((a) => rooms.includes(a.room) && a.date <= route.t);
  const recent = store.recentAlerts(rooms, route.t).length;
  const cutoff = addDays(route.t, -(ALERT_DAYS - 1));
  return (
    <>
      <div className="page-head">
        <h1>Alerts</h1>
        <p className="lede">{plural(recent, 'alert')} in the last {ALERT_DAYS} days up to {day(route.t)}, across the rooms at {c?.name}. Older ones are listed below for the record.</p>
      </div>
      {list.length ? (
        <ul className="alert-list">
          {list.map((a, i) => <AlertItem key={i} a={a} old={a.date < cutoff} roomName={store.roomName(a.room)} roomHref={href({ view: 'room', room: a.room })} />)}
        </ul>
      ) : <p className="empty">No alerts up to this day.</p>}
      <p className="caption">Kinds: behind or ahead of schedule (photo or crop sample outside the forecast range), sensor check (missing, flat or out-of-range readings), room drifting (gaining warmth much slower than the other rooms). Disease detection is not in this version. Source: alerts.json.</p>
    </>
  );
}

function AlertItem({ a, old, roomName, roomHref }: { a: AlertRow; old: boolean; roomName: string; roomHref: string }) {
  const nums = Object.entries(a.numbers ?? {});
  const warn = a.severity === 'warning';
  return (
    <li className={`card alert${old ? ' alert-old' : ''}`}>
      <span className={`sev sev-${a.severity}`} aria-hidden="true">{warn ? '!' : 'i'}</span>
      <div>
        <div className="alert-meta"><a href={roomHref}>{roomName}</a> · {day(a.date)} · {warn ? 'Warning' : 'For information'}</div>
        <h3>{a.title}</h3>
        <p>{a.message}</p>
        {nums.length > 0 && (
          <div className="alert-nums">
            {nums.map(([k, v], i) => <span key={k}>{i > 0 && ' · '}{humanKey(k)}: <b>{String(v)}</b></span>)}
          </div>
        )}
      </div>
    </li>
  );
}
