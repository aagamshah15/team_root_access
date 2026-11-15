import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { nearestIndex } from './chartMath';

/**
 * Hover / tap / keyboard selection of one day on a chart, plus the one-line
 * ink tooltip (DESIGN.md: one line, "details ›" opens the explainer; never
 * explanations in the tooltip).
 *
 * Mouse: follows the pointer and hides on leave. Touch: a tap picks a day and
 * the tooltip stays so "details ›" can be tapped. Keyboard: arrows move,
 * Enter opens details, Escape hides.
 */
export function useActiveDay(xs: number[], onDetails?: (i: number) => void) {
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (!xs.length) return;
    setActive(nearestIndex(xs, e.clientX - box.left));
  };
  const handlers = {
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && !(e.target as HTMLElement).closest('.hc-tip')) pick(e);
    },
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('.hc-tip')) return;
      pick(e);
      setPinned(e.pointerType !== 'mouse');
    },
    onPointerLeave: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && !pinned) setActive(null);
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (!xs.length) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : -1;
        setActive((a) => Math.max(0, Math.min(xs.length - 1, (a ?? (step > 0 ? -1 : xs.length)) + step)));
      } else if (e.key === 'Enter' && active !== null && onDetails) {
        onDetails(active);
      } else if (e.key === 'Escape') {
        setActive(null);
        setPinned(false);
      }
    },
    onBlur: () => {
      if (!pinned) setActive(null);
    },
  };
  return { active, handlers };
}

/**
 * The one-line tooltip: ink fill, paper text, positioned over the active day
 * and kept inside the chart's width.
 */
export function Tooltip(props: {
  x: number;
  y: number;
  width: number;
  text: string;
  onDetails?: () => void;
  children?: ReactNode;
}) {
  const { x, y, width, text, onDetails } = props;
  // Rough width for clamping: ~7px per character at 13px Plex Sans.
  const est = (text.length + (onDetails ? 11 : 0)) * 7 + 20;
  const left = Math.max(0, Math.min(width - est, x - est / 2));
  return (
    <div className="hc-tip" role="status" style={{ left, top: Math.max(0, y) }}>
      <span>{text}</span>
      {onDetails && (
        <>
          <span aria-hidden="true"> · </span>
          <button type="button" className="hc-tip-link" onClick={onDetails}>
            details ›
          </button>
        </>
      )}
    </div>
  );
}
