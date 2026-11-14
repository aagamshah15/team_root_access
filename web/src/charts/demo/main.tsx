/**
 * Dev-only demo route for the charts lane (L08): open /src/charts/demo/ under
 * `npm run dev`. Reads the real app/data files (D16 fields from L09). Not part
 * of the app build.
 */
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './demo-tokens.css';
import '../charts.css';
import { ProfitChart, RipenessChart, RipenessScale, SellableProfitStack } from '..';
import { cropSamplesFor, forecastFor, pastEstimatesFor, shipDayFor } from '../select';
import { realDays, realEvidence, realForecast, realRooms, realShipping, shippingMeta, zoneShare } from '../__fixtures__/realData';

const params = new URLSearchParams(location.search);
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme')!;

function Demo() {
  const [room, setRoom] = useState(params.get('room') ?? 'tomatonuts');
  const todays = useMemo(() => realDays.filter((d) => d.room === room).map((d) => d.today), [room]);
  const [today, setToday] = useState(params.get('today') ?? '2024-11-06');
  const t = todays.includes(today) ? today : todays[todays.length - 1];
  const [dest, setDest] = useState(shippingMeta.truck.default_destination);
  const [picked, setPicked] = useState<string | null>(null);

  const raw = realDays.find((d) => d.room === room && d.today === t)!;
  const card = raw; // days.json now carries optimal_from / optimal_to / look_day (L09)
  const rows = forecastFor(realForecast, room, t);
  const ship = shipDayFor(realShipping, room, t, dest);
  const destName = shippingMeta.destinations.find((d) => d.id === dest)?.name;
  const info = realRooms.find((r) => r.room === room)!;

  return (
    <div className="demo">
      <div className="demo-bar">
        <strong>Charts demo (L08)</strong>
        <select aria-label="Room" value={room} onChange={(e) => setRoom(e.target.value)}>
          {realRooms.map((r) => (
            <option key={r.room} value={r.room}>{r.display_name}</option>
          ))}
        </select>
        <select aria-label="Today" value={t} onChange={(e) => setToday(e.target.value)}>
          {todays.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select aria-label="Destination" value={dest} onChange={(e) => setDest(e.target.value)}>
          {shippingMeta.destinations.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const el = document.documentElement;
            el.dataset.theme = el.dataset.theme === 'dark' ? 'light' : 'dark';
          }}
        >
          Light / dark
        </button>
        <RipenessScale pctRed={raw.pct_red_now} size="small" />
      </div>
      <p className="demo-note">
        Real app/data, including L09's optimal zone and Look day. {picked ? `Last "details ›": ${picked}` : ''}
      </p>
      <div className="demo-grid">
        <div className="demo-card">
          <ProfitChart
            title="Harvest window"
            rows={rows}
            card={card}
            shipDay={ship}
            shipName={destName}
            zoneSharePct={zoneShare !== undefined ? Math.round(zoneShare * 100) : undefined}
            lookPct={shippingMeta.truck.best_band_pct_red[0]}
            onDetails={setPicked}
          />
        </div>
        <div className="demo-card">
          <RipenessChart
            title="Ripeness"
            rows={rows}
            today={t}
            pctRedNow={raw.pct_red_now}
            past={pastEstimatesFor(realDays, room, t)}
            samples={cropSamplesFor(realEvidence, room)}
            actualHarvest={info.actual_harvest}
            onDetails={setPicked}
          />
        </div>
        <div className="demo-card">
          <SellableProfitStack
            title="Pots ready vs profit"
            rows={rows}
            card={card}
            sellableTarget={shippingMeta.truck.earliest_sellable_share}
            onDetails={setPicked}
          />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
