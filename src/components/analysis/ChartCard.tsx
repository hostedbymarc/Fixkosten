import { useId, useState, type ReactNode } from 'react';

export interface TableData {
  caption: string;
  head: string[];
  rows: string[][];
}

interface Props {
  id: string;
  title: string;
  /** two-level heading (label · value · sub) */
  headline?: SummaryData;
  /** table alternative for screen readers and „Als Tabelle anzeigen“ */
  table?: TableData;
  /** custom details below the chart („Details anzeigen“), collapsed by default */
  details?: ReactNode;
  children: ReactNode;
}

export interface SummaryData {
  /** small, muted: what the number is */
  label: string;
  /** large: the number */
  value: string;
  /** muted context below */
  sub?: string;
}

/** Two-level heading of every analysis card: label · large value · sub. Never a wrapping sentence. */
export function Summary({ id, label, value, sub }: SummaryData & { id: string }) {
  return (
    <div className="mb-3 min-w-0" data-testid={`${id}-headline`}>
      <p className="text-[13px] font-medium text-ink-mute" data-testid={`${id}-headline-label`}>
        {label}
      </p>
      <p className="num truncate text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink" data-testid={`${id}-headline-value`}>
        {value}
      </p>
      {sub && (
        <p className="num truncate text-[13px] text-ink-mute" data-testid={`${id}-headline-sub`}>
          {sub}
        </p>
      )}
    </div>
  );
}

/** Section frame of every analysis chart: title, two-level heading, chart, „Details anzeigen“. */
export function ChartCard({ id, title, headline, table, details, children }: Props) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  return (
    <section aria-labelledby={`${id}-title`} data-testid={id} className="min-w-0">
      <h2 id={`${id}-title`} className="section-title mb-2 px-1">
        {title}
      </h2>
      <div className="glass min-w-0 p-4">
        {headline && <Summary id={id} {...headline} />}
        {children}
        {details && (
          <div className="mt-2 border-t border-line pt-1">
            <button
              type="button"
              aria-expanded={showTable}
              aria-controls={tableId}
              onClick={() => setShowTable((v) => !v)}
              className="focus-ring -mx-2 h-11 rounded-xl px-2 text-[14px] font-medium text-accent-ink hover:bg-accent-soft"
            >
              {showTable ? 'Details ausblenden' : 'Details anzeigen'}
            </button>
            {/* collapsed: not rendered for anyone (the toggle is the way in); the chart keeps its summary label */}
            <div id={tableId} className="mt-1" hidden={!showTable} data-testid={`${id}-details`}>
              {details}
            </div>
          </div>
        )}
        {table && (
          <div className="mt-2 border-t border-line pt-1">
            <button
              type="button"
              aria-expanded={showTable}
              aria-controls={tableId}
              onClick={() => setShowTable((v) => !v)}
              className="focus-ring -mx-2 h-11 rounded-xl px-2 text-[14px] font-medium text-accent-ink hover:bg-accent-soft"
            >
              {showTable ? 'Details ausblenden' : 'Details anzeigen'}
            </button>
            <div id={tableId} className={showTable ? 'mt-1 overflow-x-auto' : 'sr-only'} data-testid={`${id}-table`}>
              <table className="w-full text-left text-[13px]">
                <caption className="sr-only">{table.caption}</caption>
                <thead>
                  <tr className="text-ink-mute">
                    {table.head.map((h, i) => (
                      <th key={h} scope="col" className={`py-1.5 font-medium ${i > 0 ? 'pl-3 text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {table.rows.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, i) =>
                        i === 0 ? (
                          <th key={i} scope="row" className="py-1.5 font-normal text-ink">
                            {cell}
                          </th>
                        ) : (
                          <td key={i} className="num py-1.5 pl-3 text-right text-ink-soft">
                            {cell}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function EmptyCard({ id, title, text }: { id: string; title: string; text: string }) {
  return (
    <section aria-labelledby={`${id}-title`} data-testid={id}>
      <h2 id={`${id}-title`} className="section-title mb-2 px-1">
        {title}
      </h2>
      <div className="rounded-card border border-dashed border-zinc-300 px-4 py-5 text-[14px] text-ink-mute" data-testid={`${id}-empty`}>
        {text}
      </div>
    </section>
  );
}

/** Tooltip box shared by all charts (rendered by Recharts into its wrapper). */
export function TooltipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-[260px] rounded-xl border border-edge bg-surface px-3 py-2 text-[13px] shadow-sheet" data-testid="chart-tooltip">
      <p className="font-semibold text-ink">{title}</p>
      <div className="mt-0.5 flex flex-col gap-0.5 text-ink-soft">{children}</div>
    </div>
  );
}

export function TooltipRow({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5">
        {swatch && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: swatch }} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </span>
      <span className="num shrink-0 text-ink">{value}</span>
    </p>
  );
}
