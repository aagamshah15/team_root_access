import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { bestDay, defaults, loadTrial, shipment } from './model';

afterEach(() => vi.unstubAllGlobals());

it('replays the MuGrow harvest decision and the earliest date for its example order', async () => {
  const data = resolve(__dirname, '../../../data');
  vi.stubGlobal('fetch', async (url: string) => {
    const name = url.replace(/^data\//, '');
    const folder = name === 'plants.csv' ? 'inputs' : 'published';
    return new Response(readFileSync(resolve(data, folder, name), 'utf8'));
  });

  const { rooms, truck } = await loadTrial();
  expect(rooms).toHaveLength(6);
  const room = rooms.find(({ id }) => id === 'mugrow')!;
  expect(bestDay(room, truck)?.date).toBe('2024-11-07');
  expect(room.samples).toHaveLength(6);
  expect(room.photos?.[0].photo).toBeTruthy();
  const order = shipment(room, defaults(room, truck), truck);
  expect(order.best?.date).toBe('2024-11-05');
  expect(order.best?.arrival).toBe('2024-11-07');
});
