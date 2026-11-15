/* KPI tile and the "How is this worked out?" drawer (bottom sheet on phones, side panel on desktop).
 * DESIGN.md → KPI tile, Explainer panel: four parts, always in the same order. */
import { useEffect, useRef, type ReactNode } from 'react';
import type { Explainer } from '../lib/explain';

export function KpiTile({ label, value, sub, onExplain, linkText = 'How is this worked out? ›' }: {
  label: string; value: ReactNode; sub?: ReactNode; onExplain?: () => void; linkText?: string;
}) {
  return (
    <div className="kpi">
      <div className="micro">{label}</div>
      <div className="kpi-v">{value}</div>
      {sub && <div className="kpi-s">{sub}</div>}
      {onExplain && <button type="button" className="link" onClick={onExplain}>{linkText}</button>}
    </div>
  );
}

export function ExplainerDrawer({ ex, onClose }: { ex: Explainer | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!ex) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('drawer-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('drawer-open');
      prevFocus.current?.focus?.();
    };
  }, [ex, onClose]);
  if (!ex) return null;
  return (
    <div className="drawer-layer">
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabIndex={-1} ref={ref}>
        <div className="drawer-head">
          <div>
            <div className="micro">How is this worked out?</div>
            <h2 id="drawer-title">{ex.title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <section>
          <h3>What it means</h3>
          <p>{ex.meaning}</p>
        </section>
        <section>
          <h3>How we worked it out</h3>
          <ol className="steps">{ex.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>
        <section>
          <h3>The numbers used today</h3>
          {ex.inputs.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Input</th><th className="r">Value</th><th>Source</th></tr></thead>
                <tbody>
                  {ex.inputs.map((x, i) => (
                    <tr key={i}>
                      <td>{x.name}</td>
                      <td className="r num">{x.value == null ? '—' : String(x.value)}{x.unit ? ` ${x.unit}` : ''}</td>
                      <td className="muted">{x.source ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">—</p>}
        </section>
        <section>
          <h3>What could make it wrong</h3>
          {ex.caveats.length ? <ul className="caveats">{ex.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul> : <p className="muted">—</p>}
        </section>
        {ex.fallback && <p className="caption">Assembled from today's decision card and the assumptions list (the detailed explanation file was not in this data build).</p>}
      </div>
    </div>
  );
}
