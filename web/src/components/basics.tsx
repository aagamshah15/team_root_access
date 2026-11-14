/* Small shared pieces from DESIGN.md: Banner, StatusPill, Stamp, RipenessBar, NumbersTable. */
import type { ReactNode } from 'react';
import type { Status } from '../data/types';
import { STAGES, stageIndex, ripenessWords } from '../lib/ripeness';
import { STATUS } from '../lib/words';

/** "Demo customer · replayed 2024 data", always visible (DESIGN.md Banner; CLAUDE.md). */
export function Banner({ mock }: { mock: boolean }) {
  return (
    <div className="banner" role="note">
      <span>Demo customer · replayed 2024 data</span>
      {mock && <b className="banner-mock"> · Mock numbers, not results</b>}
    </div>
  );
}

export type PillKind = Status | 'harvested';
/** Status pill: wash background, the word always there (never colour alone). */
export function StatusPill({ status }: { status: PillKind }) {
  const label = status === 'harvested' ? 'Harvested' : STATUS[status]?.label ?? status;
  return <span className={`pill pill-${status}`}>{label}</span>;
}

/** Upper-case condensed text in a 2px box rotated −2°. Colour comes from the `tone` class. */
export function Stamp({ children, tone = 'muted' }: { children: ReactNode; tone?: PillKind | 'muted' | 'brand' }) {
  return <span className={`stamp tone-${tone}`}>{children}</span>;
}

/** Six equal segments in the ripeness colours, current stage outlined; always paired with words. */
export function RipenessBar({ pctRed, size = 'full', showWords = size === 'full' }: { pctRed: number | null | undefined; size?: 'small' | 'full'; showWords?: boolean }) {
  const cur = stageIndex(pctRed);
  const words = ripenessWords(pctRed);
  return (
    <div className={`ripe ripe-${size}`}>
      <div className="ripe-bar" role="img" aria-label={words}>
        {STAGES.map((s, i) => (
          <i key={s} className={`ripe-seg${i === cur ? ' on' : ''}`} style={{ background: `var(--ripe-${i + 1})` }} />
        ))}
      </div>
      {size === 'full' && (
        <div className="ripe-names" aria-hidden="true">
          {STAGES.map((s, i) => <span key={s} className={i === cur ? 'on' : ''}>{s}</span>)}
        </div>
      )}
      {showWords && <p className="ripe-words">{words}</p>}
    </div>
  );
}

export interface Col<R> { key: string; label: string; get: (r: R) => ReactNode; right?: boolean }
/** "Show the numbers": a collapsed table of the rows behind a chart or section. */
export function NumbersTable<R>({ rows, cols, summary = 'Show the numbers' }: { rows: R[]; cols: Col<R>[]; summary?: string }) {
  if (!rows.length) return null;
  return (
    <details className="numbers">
      <summary>{summary}</summary>
      <div className="table-wrap">
        <table>
          <thead><tr>{cols.map((c) => <th key={c.key} className={c.right ? 'r' : ''}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{cols.map((c) => <td key={c.key} className={c.right ? 'r' : ''}>{c.get(r)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
