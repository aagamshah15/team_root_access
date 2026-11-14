/* Screen state lives in the URL hash (#view=room&room=mugrow&c=c1&t=2024-11-06), so a demo link reopens
 * the same screen, customer and replay day. Same scheme as the wave-1 app. */
import { useCallback, useEffect, useState } from 'react';
import type { Store } from '../data/store';
import { DEFAULT_TODAY } from '../data/store';

export type View = 'home' | 'room' | 'alerts' | 'how' | 'add';
export const VIEWS: View[] = ['home', 'room', 'alerts', 'how', 'add'];
export interface Route { view: View; room: string | null; c: string; t: string }

/** Read and validate the hash against the data (unknown customer/room/date fall back to safe defaults). */
export function parseHash(hash: string, store: Store): Route {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const v = p.get('view') as View | null;
  let view: View = v && VIEWS.includes(v) ? v : 'home';
  const room = p.get('room');
  let c = p.get('c');
  const owner = room ? store.rooms.get(room) : undefined;
  if (owner && !c) c = owner.customer_id;   // a deep link to a room opens its own customer
  if (!c || !store.customers.some((x) => x.customer_id === c)) c = store.customers[0]?.customer_id ?? '';
  const t0 = p.get('t');
  const t = store.clampToday(t0 && /^\d{4}-\d{2}-\d{2}$/.test(t0) ? t0 : DEFAULT_TODAY);
  const cust = store.customer(c);
  if (view === 'room' && !(room && cust?.rooms.includes(room))) view = 'home';
  return { view, room: view === 'room' ? room : null, c, t };
}

export function hashFor(r: Route): string {
  const p = new URLSearchParams();
  p.set('view', r.view);
  if (r.view === 'room' && r.room) p.set('room', r.room);
  p.set('c', r.c);
  p.set('t', r.t);
  return '#' + p.toString();
}

/** Current route plus helpers to link to (`href`) or move to (`go`) another screen. */
export function useRoute(store: Store) {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash, store));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash, store));
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.history.replaceState(null, '', hashFor(route));
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
  const href = useCallback((over: Partial<Route>) => hashFor({ ...route, ...over }), [route]);
  const go = useCallback((over: Partial<Route>) => {
    const h = hashFor({ ...route, ...over });
    if (h !== window.location.hash) window.location.hash = h;
  }, [route]);
  return { route, href, go };
}
