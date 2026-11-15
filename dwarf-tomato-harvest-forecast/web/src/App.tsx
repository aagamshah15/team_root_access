/* App shell: loads app/data once, keeps the screen in the URL hash, and draws the banner, header, tabs,
 * current screen and the credit footer (DESIGN.md: banner and dataset credit on every screen). */
import { useEffect, useMemo, useState } from 'react';
import { AppCtx, useApp, type Ctx } from './context';
import { loadData, isMock } from './data/load';
import { Store } from './data/store';
import { addDays, long, short } from './data/format';
import { useRoute, type Route } from './lib/route';
import { Banner } from './components/basics';
import { Home } from './screens/Home';
import { RoomScreen } from './screens/Room';
import { Alerts } from './screens/Alerts';
import { How } from './screens/How';
import { AddRoomScreen } from './slots';

export function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadData().then((d) => setStore(new Store(d))).catch((e: Error) => setError(e.message));
  }, []);
  if (error) {
    return (
      <>
        <Banner mock={false} />
        <main className="page"><p className="empty">Could not load the app data ({error}). Run <code>make build</code>, then <code>npm run dev</code> in <code>web/</code>.</p></main>
      </>
    );
  }
  if (!store) return <><Banner mock={false} /><main className="page"><p className="empty">Loading…</p></main></>;
  return <Shell store={store} />;
}

const photoUrl = (p: string | null) => {
  if (!p) return null;
  if (/^https?:/.test(p)) return null;     // only local published photos
  return p.replace(/^\.?\//, '');
};

function Shell({ store }: { store: Store }) {
  const { route, href, go } = useRoute(store);
  const ctx = useMemo<Ctx>(() => ({ store, route, href, go, photoUrl }), [store, route, href, go]);
  const cust = store.customer(route.c);
  const alertCount = cust ? store.recentAlerts(cust.rooms, route.t).length : 0;
  useEffect(() => { window.scrollTo(0, 0); }, [route.view, route.room]);
  return (
    <AppCtx.Provider value={ctx}>
      <Banner mock={isMock(store.data)} />
      <Header />
      <nav className="tabs" aria-label="Sections">
        <div className="tabs-in">
          <Tab view="home" label="My greenhouses" />
          <Tab view="alerts" label="Alerts" count={alertCount} />
          <Tab view="how" label="How it works" />
          <Tab view="add" label="Add a room" />
        </div>
      </nav>
      <main className="page" id="main" tabIndex={-1}>
        {route.view === 'room' && route.room ? <RoomScreen key={route.room} room={route.room} />
          : route.view === 'alerts' ? <Alerts />
          : route.view === 'how' ? <How />
          : route.view === 'add' ? <AddRoomPage />
          : <Home />}
      </main>
      <Footer />
    </AppCtx.Provider>
  );
}

function Tab({ view, label, count }: { view: Route['view']; label: string; count?: number }) {
  const { route, href } = useApp();
  const on = route.view === view || (view === 'home' && route.view === 'room');
  return (
    <a href={href({ view, room: null })} aria-current={on ? 'page' : undefined}>
      {label}{count ? <span className="tab-count" aria-label={`${count} recent`}>{count}</span> : null}
    </a>
  );
}

function Header() {
  const { store, route, go } = useApp();
  const toggleTheme = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('hw-theme', root.dataset.theme); } catch { /* ignore */ }
  };
  const step = (n: number) => go({ t: store.clampToday(addDays(route.t, n)) });
  return (
    <header className="top">
      <div className="top-in">
        <a className="brand" href={`#view=home&c=${route.c}&t=${route.t}`}>
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <span className="brand-name">Harvest Window</span>
            <span className="brand-sub">When to harvest each room, how sure we are, and why</span>
          </span>
        </a>
        <div className="controls">
          <label className="field">
            <span className="micro">Customer</span>
            <select value={route.c} onChange={(e) => go({ c: e.target.value, view: route.view === 'room' ? 'home' : route.view, room: null })}>
              {store.customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.name} (demo)</option>)}
            </select>
          </label>
          <div className="field">
            <span className="micro" id="today-label">Today (replayed)</span>
            <div className="date-row">
              <button type="button" className="icon-btn" onClick={() => step(-1)} disabled={route.t <= store.minToday} aria-label="Previous day">‹</button>
              <input type="date" aria-labelledby="today-label" value={route.t} min={store.minToday} max={store.maxToday}
                onChange={(e) => e.target.value && go({ t: store.clampToday(e.target.value) })} />
              <button type="button" className="icon-btn" onClick={() => step(1)} disabled={route.t >= store.maxToday} aria-label="Next day">›</button>
            </div>
          </div>
          <button type="button" className="icon-btn theme-btn" onClick={toggleTheme} aria-label="Switch light or dark theme" title="Light / dark">◐</button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const { store } = useApp();
  const m = store.data.days.meta;
  return (
    <footer className="foot">
      <p>Data: 4th Autonomous Greenhouse Challenge, dwarf tomato (Maree et al., 4TU.ResearchData, CC BY 4.0), replayed as if live. Customer names are fictional. All figures are model estimates.</p>
      {m.source && <p className="muted">Source: {m.source} Built {long(m.built_at.slice(0, 10))}. Replay dates {short(m.as_of.from)}–{short(m.as_of.to)}.</p>}
    </footer>
  );
}

function AddRoomPage() {
  const { store, route, go } = useApp();
  const props = { customer: store.customer(route.c), rooms: [...store.rooms.values()], onDone: () => go({ view: 'home' }) };
  if (AddRoomScreen) return <AddRoomScreen {...props} />;
  return (
    <div className="page-head">
      <h1>Add a room</h1>
      <p className="lede">Register a new room: its name, area, planting date (required) and data files. Each file is checked in your browser against the input contract; the forecast itself runs in our pipeline.</p>
      <div className="card placeholder-card">
        <span className="micro">Coming in this build</span>
        <p>The form is being built by the add-a-room lane (L10). Nothing is sent anywhere from this screen.</p>
      </div>
    </div>
  );
}
