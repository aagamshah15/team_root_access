/* Screen 1: My greenhouses. One crate tag per room for the chosen demo customer, on the replay day. */
import { useApp } from '../context';
import { CrateTag } from '../components/CrateTag';
import { day, plural } from '../data/format';
import type { Status } from '../data/types';
import { STATUS } from '../lib/words';

export function Home() {
  const { store, route, href } = useApp();
  const c = store.customer(route.c);
  if (!c) return <p className="empty">No customers in this data build.</p>;
  const states = c.rooms.map((r) => store.roomState(r, route.t));
  const counts = new Map<Status, number>();
  for (const s of states) if (s.kind === 'live') counts.set(s.d.status, (counts.get(s.d.status) ?? 0) + 1);
  const bits = (Object.keys(STATUS) as Status[]).filter((k) => counts.get(k)).map((k) => `${plural(counts.get(k)!, 'room')} ${STATUS[k].label.toLowerCase()}`);
  const done = states.filter((s) => s.kind === 'harvested').length;
  if (done) bits.push(`${plural(done, 'room')} already harvested`);
  return (
    <>
      <div className="page-head">
        <div className="micro">Your rooms · {day(route.t)}</div>
        <h1>{c.name}</h1>
        <p className="muted">{c.tagline}</p>
        <p className="lede">{bits.length ? `${bits.join(', ')}.` : 'No forecast for this day.'}</p>
      </div>
      <div className="tags">
        {states.map((s) => (
          <CrateTag
            key={s.room}
            state={s}
            name={store.roomName(s.room)}
            today={route.t}
            alerts={store.recentAlerts([s.room], route.t).length}
            href={href({ view: 'room', room: s.room })}
          />
        ))}
      </div>
    </>
  );
}
