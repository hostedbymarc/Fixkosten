import { useId, useState, type ReactNode } from 'react';

export interface TableData {
  caption: string;
  head: string[];
  rows: string[][];
}

interface Props {
  id: string;
  title: string;
  /** one computed sentence above the chart */
  headline?: string;
  /** table alternative for screen readers and „Als Tabelle anzeigen“ */
  table?: TableData;
  children: ReactNode;
}

/** Section frame of every analysis chart: title, key sentence, chart, table toggle. */
export function ChartCard({ id, title, headline, table, children }: Props) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  return (
    <section aria-labelledby={`${id}-title`} data-testid={id} className="min-w-0">
      <h2 id={`${id}-title`} className="section-title mb-2 px-1">
        {title}
      </h2>
      <div className="card min-w-0 p-4">
        {headline && (
          <p className="mb-3 text-[15px] font-medium text-ink" data-testid={`${id}-headline`}>
            {headline}
          </p>
        )}
        {children}
        {table && (
          <div className="mt-2 border-t border-line pt-1">
            <button
              type="button"
              aria-expanded={showTable}
              aria-controls={tableId}
              onClick={() => setShowTable((v) => !v)}
              className="focus-ring -mx-2 h-11 rounded-xl px-2 text-[14px] font-medium text-accent hover:bg-accent-soft"
            >
              {showTable ? 'Tabelle ausblenden' : 'Als Tabelle anzeigen'}
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
    <div className="max-w-[260px] rounded-xl border border-line bg-white px-3 py-2 text-[13px] shadow-card" data-testid="chart-tooltip">
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
