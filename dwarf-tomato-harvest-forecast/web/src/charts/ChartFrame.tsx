import type { ReactNode } from 'react';

/** One column of the "Show the numbers" table. */
export interface NumbersColumn<R> {
  label: string;
  value: (row: R) => string;
}

/**
 * The frame every chart shares (DESIGN.md → Charts rules): an optional title,
 * a one-line finding above, the chart, a source caption below, and a
 * "Show the numbers" table folded away until asked for.
 */
export function ChartFrame<R>(props: {
  title?: string;
  finding: string;
  caption: string;
  rows: R[];
  columns: NumbersColumn<R>[];
  rowKey: (row: R) => string;
  children: ReactNode;
  className?: string;
}) {
  const { title, finding, caption, rows, columns, rowKey, children, className } = props;
  return (
    <figure className={`hc-frame ${className ?? ''}`}>
      {title && <h3 className="hc-title">{title}</h3>}
      <p className="hc-finding">{finding}</p>
      {children}
      <figcaption className="hc-caption">{caption}</figcaption>
      <details className="hc-numbers">
        <summary>Show the numbers</summary>
        <div className="hc-table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={rowKey(r)}>
                  {columns.map((c) => (
                    <td key={c.label}>{c.value(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
