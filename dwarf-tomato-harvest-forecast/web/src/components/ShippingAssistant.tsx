/* The AI shipping assistant (ported from the wave-1 app). Feature flag: it shows only when the page runs as a
 * Claude artifact with sampling (window.claude.use). It quotes lib/trip.ts results; it never invents dates. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DayCard, Destination, ForecastRow, Truck } from '../data/types';
import { planTrip, type TripInput, type TripPlan } from '../lib/trip';

/* Minimal typing for the artifact runtime's sampling call. */
interface SampleResult { text: string }
interface SampleErr { code?: string; text?: string }
type Tool = { name: string; description: string; inputSchema?: object; execute: (input: Record<string, unknown>) => unknown };
type SampleFn = ((msgs: { role: string; content: string }[], opts: { tools: Tool[]; modelTier: string; signal: AbortSignal; onText: (e: { text: string }) => void }) => Promise<SampleResult>)
  & { limits: () => Promise<{ tools?: boolean } | null> };
declare global {
  interface Window { claude?: { use?: (cap: string) => Promise<SampleFn | null> } }
}

/** Feature flag: on only inside a Claude artifact that offers sampling. */
export const assistantAvailable = (): boolean => typeof window !== 'undefined' && typeof window.claude?.use === 'function';

let samplePromise: Promise<SampleFn | null> | null = null;
const getSample = () => (samplePromise ??= window.claude?.use ? window.claude.use('sample') : Promise.resolve(null));

const CHAT_ERR: Record<string, string> = {
  not_granted: 'The assistant needs your permission to use Claude in this app. It stays off for this visit.',
  sampling_disabled: 'Claude is not available for this account.',
  tools_unavailable: 'This view cannot run the assistant’s calculator.',
  rate_limited: 'Too many requests just now. Try again in a minute.',
  session_expired: 'Please sign in to Claude again.',
  refused: 'The assistant could not answer that. Try rephrasing.',
  empty_completion: 'No answer came back. Try a shorter question.',
};
const FATAL = ['not_granted', 'sampling_disabled', 'tools_unavailable', 'not_declared', 'capability_disabled', 'capability_removed'];

interface Props {
  room: string; roomName: string; today: string; d: DayCard; fc: ForecastRow[]; truck: Truck; dests: Destination[];
  onPlan: (plan: TripPlan, label: string) => void;
}

function rules(p: Props): string {
  return `You are the shipping assistant inside "Harvest Window", a greenhouse app for dwarf tomatoes sold as whole potted plants.
The grower is deciding where these pots go, how they travel, and therefore when to pluck (harvest) them.
Greenhouse location: Bleiswijk, the Netherlands. Room: ${p.roomName}. Today (replayed data): ${p.today}.
Rules:
- Call get_room_context first if you need the room's ripeness or the preset destinations.
- Before giving any date, call plan_trip. Never invent dates, percentages or shelf days: quote the tool's numbers.
- If the grower has not said where the pots go or how they travel, ask (at most two short questions). Useful facts: destination, transport (refrigerated truck, normal truck, sea container, air), truck temperature, one or two drivers, whether the buyer checks the pots on arrival, how many best days on the shelf they need.
- For a named place, estimate the road distance from Bleiswijk and say it is approximate. For sea or air, set transit_days yourself and state the assumption. A normal unrefrigerated truck runs at about 18 °C.
- Compare a few options with plan_trip when the grower is choosing between destinations or transport.
- Mention warnings the tool returns (chilling below 10 °C, more than ${p.truck.max_transit_days} days in a truck, plucking after the latest day).
- Plain words for a busy grower, under 120 words, dates like "Tue 12 Nov". Say "estimated"; these are model estimates on replayed 2024 data.`;
}

function summary(pl: TripPlan) {
  return pl.pluck_day ? {
    pluck_day: pl.pluck_day, pluck_reason: pl.pluck_reason, days_on_road: pl.transit_days, truck_temp_c: pl.transit_temp_c,
    arrival_day: pl.arrival_day, red_on_arrival_pct: Math.round(pl.pct_on_arrival ?? 0),
    pots_ready_on_arrival_pct: Math.round((pl.sellable_on_arrival ?? 0) * 100), best_on_shelf: [pl.best_from, pl.best_until],
    best_days_on_shelf: pl.best_shelf_days, sell_by: pl.sell_until, latest_pluck_day_for_wanted_shelf_days: pl.ship_by_day,
    fruit_stops_growing: pl.weight_complete_day, warnings: { chilling_risk: pl.chilling_risk, too_long_for_potted_plants: pl.too_long, late: pl.late },
  } : { pluck_day: null, note: 'No pluck day within the forecast', fruit_stops_growing: pl.weight_complete_day };
}

function tools(p: Props): Tool[] {
  return [
    {
      name: 'get_room_context',
      description: 'Returns the room’s state today (ripeness, fruit stops growing, best-profit day) and the pluck plan for each preset destination with the default truck. No arguments.',
      execute: () => ({
        room: p.roomName, today: p.today, red_today_pct: Math.round(p.d.pct_red_now ?? 0), pots_ready_today_pct: Math.round((p.d.sellable_share_now ?? 0) * 100),
        fruit_stops_growing: p.d.weight_complete_day, best_profit_day_local: p.d.best_day,
        default_truck: { temp_c: p.truck.temp_c, hours_per_day: p.truck.driving_hours_per_day, speed_kmh: p.truck.avg_speed_kmh },
        shop_temp_c: p.truck.shop_temp_c, best_condition_red_pct: p.truck.best_band_pct_red,
        presets: p.dests.map((x) => ({ name: x.name, distance_km: x.distance_km, ...summary(planTrip(p.fc, p.d, p.truck, { distance_km: x.distance_km })) })),
      }),
    },
    {
      name: 'plan_trip',
      description: 'Works out the pluck day for one trip with the app’s model and shows it on the page. Give distance_km (road distance from Bleiswijk) or transit_days. Returns pluck day, arrival day, ripeness and pots ready on arrival, best days on the shelf, sell-by and warnings.',
      inputSchema: {
        type: 'object',
        properties: {
          destination_name: { type: 'string' }, distance_km: { type: 'number' },
          transit_days: { type: 'number', description: 'Use for sea or air, or when the grower states it' },
          transit_temp_c: { type: 'number', description: `Default ${p.truck.temp_c} (refrigerated truck)` }, drivers: { type: 'number', description: '1 or 2' },
          shop_temp_c: { type: 'number' }, min_best_shelf_days: { type: 'number' },
        },
        required: ['destination_name'],
      },
      execute: (input) => {
        const trip: TripInput = {};
        for (const k of ['distance_km', 'transit_days', 'transit_temp_c', 'drivers', 'shop_temp_c', 'min_best_shelf_days'] as const) {
          const v = input[k];
          if (v != null && v !== '' && Number.isFinite(Number(v))) trip[k] = Number(v);
        }
        if (trip.distance_km == null && trip.transit_days == null) throw new Error('Give distance_km or transit_days.');
        const plan = planTrip(p.fc, p.d, p.truck, trip);
        p.onPlan(plan, `${String(input.destination_name || 'Trip').slice(0, 60)} (assistant)`);
        return summary(plan);
      },
    },
  ];
}

export function ShippingAssistant(p: Props) {
  const [turns, setTurns] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [off, setOff] = useState<string | null>(null);
  const [sample, setSample] = useState<SampleFn | null>(null);
  const [input, setInput] = useState('');
  const ctl = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    getSample().then(async (s) => {
      if (!live) return;
      if (!s) { setOff('The assistant works when Harvest Window is opened as a Claude artifact. Use "Plan your own trip" above meanwhile.'); return; }
      const caps = await s.limits().catch(() => null);
      if (!live) return;
      if (!caps?.tools) { setOff('This view cannot run the assistant’s calculator. Use "Plan your own trip" above.'); return; }
      setSample(() => s);
    }).catch(() => live && setOff('The assistant is unavailable right now.'));
    return () => { live = false; ctl.current?.abort(); };
  }, []);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [turns, pending]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending != null || !sample) return;
    setInput('');
    const next = [...turns, { role: 'user' as const, content: text }].slice(-12);
    setTurns(next);
    setPending('Thinking…');
    setNote('');
    const c = new AbortController();
    ctl.current = c;
    try {
      const { text: answer } = await sample([{ role: 'user', content: rules(p) }, ...next], {
        tools: tools(p), modelTier: 'quick', signal: c.signal, onText: ({ text: t }) => setPending(t),
      });
      setTurns((t) => [...t, { role: 'assistant', content: answer }]);
    } catch (err) {
      const er = err as SampleErr;
      if (er?.text) setTurns((t) => [...t, { role: 'assistant', content: `${er.text} [interrupted]` }]);
      if (er?.code !== 'cancelled') {
        const msg = (er?.code && CHAT_ERR[er.code]) || 'The assistant is unavailable right now. Try again shortly.';
        setNote(msg);
        if (er?.code && FATAL.includes(er.code)) setOff(msg);
      }
    } finally {
      setPending(null);
      ctl.current = null;
    }
  };

  return (
    <div className="chat">
      <p className="caption">Tell it where the pots go and how they travel; it asks what it needs, then works out the pluck day with the same model. Answers are AI-written estimates and use your own Claude allowance.</p>
      <div className="chat-log" ref={logRef} aria-live="polite">
        {!turns.length && pending == null && <p className="chat-empty">Where are these pots going, and how will they travel?</p>}
        {turns.map((t, i) => <div key={i} className={`bubble ${t.role === 'user' ? 'me' : 'ai'}`}>{t.content}</div>)}
        {pending != null && <div className="bubble ai pending">{pending}</div>}
      </div>
      <form className="chat-form" onSubmit={send}>
        <label className="sr-only" htmlFor="chat-input">Message to the shipping assistant</label>
        <textarea id="chat-input" rows={2} maxLength={1000} value={input} disabled={!!off || !sample}
          placeholder="e.g. 3,000 pots to a garden centre near Vienna by refrigerated truck; the buyer checks them on arrival"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
        <div className="chat-btns">
          <button className="btn" type="submit" disabled={!!off || !sample || pending != null}>Send</button>
          {pending != null && <button className="btn ghost" type="button" onClick={() => ctl.current?.abort()}>Stop</button>}
          <button className="btn ghost" type="button" onClick={() => { ctl.current?.abort(); setTurns([]); }}>New chat</button>
        </div>
      </form>
      {(off || note) && <p className="note">{off ?? note}</p>}
    </div>
  );
}
