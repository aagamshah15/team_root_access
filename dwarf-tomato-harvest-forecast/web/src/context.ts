/* App context (store, route, links), in its own module so screens don't import App.tsx (no import cycle). */
import { createContext, useContext } from 'react';
import type { Store } from './data/store';
import type { Route } from './lib/route';

export interface Ctx {
  store: Store;
  route: Route;
  href: (over: Partial<Route>) => string;
  go: (over: Partial<Route>) => void;
  /** Turn an evidence photo path (relative to the page, e.g. data/photos/x.jpg) into a URL. */
  photoUrl: (p: string | null) => string | null;
}
export const AppCtx = createContext<Ctx | null>(null);
export const useApp = (): Ctx => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside the app');
  return c;
};
