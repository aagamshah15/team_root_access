/* Screen 4: How it works & limits. Logic in plain words, the timing test with its baselines (including where a
 * baseline wins), every assumption, limits, data and credits. */
import { useApp } from '../App';
import { plural, short } from '../data/format';
import type { BacktestRow } from '../data/types';

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function How() {
  const { store } = useApp();
  const bt = store.data.backtest;
  const tests = new Map<string, BacktestRow[]>();
  for (const r of bt.rows) tests.set(r.test, [...(tests.get(r.test) ?? []), r]);
  const per = bt.meta.per_room ?? [];
  return (
    <>
      <div className="page-head">
        <h1>How it works &amp; limits</h1>
        <p className="lede">The app replays a real greenhouse trial day by day, as if it were live. For each room it estimates how ripe the fruit is, when picking pays best, and how sure it is. The ripening curve is learned on the other rooms, using only data up to "today"; once this room has a crop sample, the curve is nudged toward it.</p>
      </div>
      <section className="card section">
        <h2>The logic in plain words</h2>
        <ol className="steps">
          <li><b>Warmth clock.</b> Tomatoes ripen with accumulated warmth. Each day adds its average temperature above a base temperature ("degree-days"). A ripening curve learned on the other rooms turns warmth into the share of fruit weight that is red.</li>
          <li><b>Camera check.</b> A daylight noon photo shows when red fruit first appears. That anchors the curve for this room. Lamp-lit photos are purple and are skipped.</li>
          <li><b>Crop samples.</b> When growers weigh a few plants, the curve is pulled towards what they found.</li>
          <li><b>Pots ready to sell.</b> Pots in a room ripen at different speeds. From the spread between plants we estimate the share of pots that would sell on each day.</li>
          <li><b>Harvest window.</b> Using the challenge's scoring rules (checked against Maree et al. 2025), we estimate profit per m² per day grown for each coming day: the earliest sellable day, the most-profit day, the optimal zone around it, and the day losses start.</li>
          <li><b>Three harvest points.</b> Ship: the day to pick for a truck trip so pots arrive ready to sell. Profit: the most-profit day. Look: the first day at the colour shoppers like best.</li>
          <li><b>How sure we are.</b> The weakest of three checks: how wide the best-day range is, whether warmth, camera and sample agree, and how fresh the evidence is.</li>
        </ol>
      </section>
      <section className="card section">
        <h2>Timing test: how good is it, honestly?</h2>
        <p className="muted">Each room is forecast as if we did not know its hand measurements, then compared with what really happened. Simple baselines sit next to our model, including where a baseline does better. Lower error is better.</p>
        {[...tests].map(([test, rows]) => {
          const best = Math.min(...rows.map((r) => r.value));
          return (
            <div key={test}>
              <h3>{test}</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Method</th><th className="r">Error</th><th>Unit</th><th className="r">Rooms</th><th>Note</th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={r.value === best ? 'win' : ''}>
                        <td>{r.method} {r.value === best && <span className="tag-win">better</span>}</td>
                        <td className="r num">{r.value}</td><td>{r.unit}</td><td className="r num">{r.n}</td><td>{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {per.length > 0 && (
          <details className="numbers">
            <summary>Per room</summary>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Room</th><th>Test</th><th>Method</th><th>Predicted</th><th>Actual</th><th className="r">Off by</th></tr></thead>
                <tbody>
                  {per.map((r, i) => (
                    <tr key={i}>
                      <td>{store.roomName(r.room)}</td><td>{r.test ? r.test.replace(/_/g, ' ') : '—'}</td><td>{r.method}</td>
                      <td>{isDate(r.predicted) ? short(r.predicted as string) : String(r.predicted)}</td>
                      <td>{isDate(r.actual) ? short(r.actual as string) : String(r.actual)}</td>
                      <td className="r num">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        <p className="caption">Source: backtest.json.</p>
      </section>
      <section className="card section">
        <h2>Assumptions</h2>
        <p className="muted">Every setting the numbers depend on, where it comes from, and what changes if it is wrong.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Assumption</th><th className="r">Value</th><th>Source</th><th>If it is wrong</th></tr></thead>
            <tbody>
              {store.data.assumptions.rows.map((a, i) => (
                <tr key={i}><td>{a.name}</td><td className="r num">{a.value == null ? '—' : String(a.value)}{a.unit ? ` ${a.unit}` : ''}</td><td>{a.source}</td><td>{a.if_wrong}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">Source: assumptions.json (built from config/crop.yaml; details in docs/assumptions.md). Ripeness stage names on the ripeness bar follow the USDA tomato colour classes applied to % red by weight, so stages are approximate.</p>
      </section>
      <section className="card section">
        <h2>Limits</h2>
        <ul className="limits">
          <li>{plural(store.rooms.size, 'room')}, one autumn, one site, one variety, and only a few hand measurements per room. Patterns are associations, not proof.</li>
          <li>The camera sees the top of the canopy and part of one table; lamp-lit photos are unusable for colour.</li>
          <li>Fruit dry matter (part of the real price) is not in the data, and harvest labour is not costed.</li>
          <li>The temperature what-if assumes ripening follows warmth; it was not tested by changing a greenhouse.</li>
          <li>Profit on days other than the actual harvest is a model estimate: each room was harvested once.</li>
          <li>Shipping plans exclude freight cost; ripening in the truck and shop follows the same warmth clock. The fruit-weight curve steepness was fitted on all rooms' full-season weighings (a stated exception to the honest-testing rule).</li>
          <li>Customer names are fictional. Each "customer" is two rooms of the same research trial.</li>
        </ul>
      </section>
      <section className="card section">
        <h2>Data and credits</h2>
        <ul className="limits">
          <li>Dataset: 4th Autonomous Greenhouse Challenge, dwarf tomato (Maree et al., 4TU.ResearchData), licence CC BY 4.0. Climate logs, outside weather, canopy photos and hand measurements.</li>
          <li>Builds on our team's earlier work: ripening curve, photo onset and profit model from the main project (Prathamesh Mulay); crop-sample check and mean-baseline ideas from the HarvestWindow planner (Chaitanya Nirantar); shipping plan (Prathamesh). Scoring rules: Maree et al. 2025, Sensors 25:4321.</li>
          <li>Built for the UIUC CDA Precision &amp; Digital Agriculture Hackathon (Track 1, Challenge 2).</li>
        </ul>
      </section>
    </>
  );
}
