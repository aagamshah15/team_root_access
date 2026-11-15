import type { Doc, DayCard, EvidenceRow, ForecastRow, ShippingMeta, ShippingRow, Meta } from './types';

async function readRows<R, M extends Meta = Meta>(name: string): Promise<Doc<R, M>> {
  const response = await fetch(`data/${name}.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${name} (${response.status}).`);
  return response.json();
}

export async function loadData() {
  const [days, forecast, evidence, shipping] = await Promise.all([
    readRows<DayCard>('days'),
    readRows<ForecastRow>('forecast'),
    readRows<EvidenceRow>('evidence'),
    readRows<ShippingRow, ShippingMeta>('shipping'),
  ]);
  return { days, forecast, evidence, shipping };
}
