/* Rendering checks for the design components: words always present, missing wave-2 fields show "—". */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HarvestDayStrip } from './HarvestDayStrip';
import { CrateTag, timingStamp } from './CrateTag';
import { RipenessBar } from './basics';
import type { DayCard } from '../data/types';

const card = {
  room: 'r', today: '2024-11-06', status: 'plan_harvest', earliest_sellable_day: '2024-11-09', best_day: '2024-11-11',
  best_day_low: '2024-11-07', best_day_high: '2024-11-16', losses_start_day: '2024-11-13', confidence: 'medium',
  pct_red_now: 29, conf_reasons: [], conf_agreement: 'agree',
} as unknown as DayCard;
const fc = Array.from({ length: 12 }, (_, i) => ({ date: `2024-11-${String(6 + i).padStart(2, '0')}` }));

describe('HarvestDayStrip', () => {
  it('one tile per day; missing look day shows "—" and says it is beyond the forecast', () => {
    const { container } = render(<HarvestDayStrip rows={fc} day={card} today="2024-11-06" shipDay="2024-11-09" shipLabel="Munich" />);
    expect(container.querySelectorAll('li.tile')).toHaveLength(12);
    expect(container.querySelector('.tile-best')?.textContent).toContain('11');
    expect(container.querySelector('.tile-today')?.textContent).toContain('6');
    expect(screen.getByText(/to Munich/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Look —/ })).toBeTruthy();
  });
});

describe('CrateTag', () => {
  it('shows status word, tag date and timing stamp', () => {
    render(<CrateTag state={{ kind: 'live', room: 'r', meta: undefined, d: card }} name="House 1" today="2024-11-06" alerts={1} href="#" />);
    expect(screen.getByText('Plan harvest')).toBeTruthy();
    expect(screen.getByText('MON 11 NOV')).toBeTruthy();
    expect(screen.getByText('In 5 days')).toBeTruthy();
    expect(screen.getByText('1 alert')).toBeTruthy();
  });
  it('timing stamp words', () => {
    expect(timingStamp('2024-11-06', '2024-11-06')).toBe('Today');
    expect(timingStamp('2024-11-06', '2024-11-07')).toBe('Tomorrow');
    expect(timingStamp('2024-11-06', '2024-11-04')).toBe('2 days ago');
  });
});

describe('RipenessBar', () => {
  it('outlines one stage and pairs it with words', () => {
    const { container } = render(<RipenessBar pctRed={29} />);
    expect(container.querySelectorAll('.ripe-seg.on')).toHaveLength(1);
    expect(screen.getByText(/Turning: about 29%/)).toBeTruthy();
  });
});
