/* Destination picker for the shipping section: the preset destinations from shipping.json meta. */
import type { Destination } from '../data/types';
import { km, plural } from '../data/format';

export const roadWords = (days: number) => (days ? `${plural(days, 'day')} by truck` : 'same day');

export function DestinationPicker({ destinations, value, onChange, id = 'dest' }: {
  destinations: Destination[]; value: string | null; onChange: (id: string) => void; id?: string;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span className="micro">Where the pots go</span>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {destinations.map((x) => (
          <option key={x.id} value={x.id}>{x.name} · {km(x.distance_km)} km · {roadWords(x.transit_days)}</option>
        ))}
      </select>
    </label>
  );
}
