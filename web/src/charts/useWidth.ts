import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Width of a container element, kept current with a ResizeObserver, so each
 * chart draws to the space it is given (390 px phone to 1200 px desktop).
 * Falls back to `initial` where ResizeObserver is missing (tests, old browsers).
 */
export function useWidth<T extends HTMLElement>(initial = 600) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
