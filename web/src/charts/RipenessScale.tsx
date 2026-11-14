import { STAGES, stageIndex } from './ripeness';

/**
 * The six-step ripeness bar (DESIGN.md → Ripeness bar): six equal segments in
 * the ripeness colours, the current stage outlined in ink. `small` is the
 * 120 px tag version; `full` stretches and shows the stage names under it.
 * The only place the ripeness colours are used.
 */
export function RipenessScale(props: { pctRed: number; size?: 'small' | 'full'; edges?: number[] }) {
  const { pctRed, size = 'full', edges } = props;
  const current = stageIndex(pctRed, edges);
  return (
    <div
      className={`hc-scale hc-scale-${size}`}
      role="img"
      aria-label={`Approximate stage: ${STAGES[current]} (${STAGES.length}-step ripeness scale)`}
    >
      <div className="hc-scale-bar">
        {STAGES.map((s, i) => (
          <i
            key={s}
            className={i === current ? 'on' : undefined}
            data-stage={s}
            data-current={i === current ? 'true' : undefined}
            style={{ background: `var(--ripe-${i + 1})` }}
          />
        ))}
      </div>
      {size === 'full' && (
        <div className="hc-scale-names" aria-hidden="true">
          {STAGES.map((s, i) => (
            <span key={s} className={i === current ? 'on' : undefined}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
