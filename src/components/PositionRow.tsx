import { effectiveDate, nextPlannedChange, type DueItem } from '../lib/calc';
import { formatDelta, formatEUR } from '../lib/format';
import type { OneOff } from '../lib/types';
import { Badge, DeltaChip, formatIsoDate, scheduleLabel } from './Chips';

interface Props {
  item: DueItem;
  onToggle: () => void;
  onOpen: () => void;
  onToggleOneOff: (oneOff: OneOff) => void;
  onOpenOneOff: (oneOff: OneOff) => void;
}

function CheckCircle({ state, small }: { state: 'open' | 'paid' | 'skipped'; small?: boolean }) {
  const size = small ? 'h-[22px] w-[22px]' : 'h-[26px] w-[26px]';
  if (state === 'paid') {
    return (
      <span className={`anim-check flex ${size} items-center justify-center rounded-full bg-paid text-white`}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 7.2l2.6 2.6L11 4.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === 'skipped') {
    return (
      <span className={`flex ${size} items-center justify-center rounded-full bg-zinc-200 text-ink-mute`}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return <span className={`${size} rounded-full border-[1.75px] border-zinc-300 bg-white transition-colors group-hover:border-accent`} />;
}

export function PositionRow({ item, onToggle, onOpen, onToggleOneOff, onOpenOneOff }: Props) {
  const { position, payment, status } = item;
  const done = status !== 'open';
  const schedule = item.plan ? scheduleLabel(item.plan, item.period) : null;
  const amount = status === 'paid' ? payment!.actualAmount : item.planned;
  const next = nextPlannedChange(position, item.period);

  return (
    <li data-testid="position-row" data-position={position.id} data-paid={status === 'paid'} data-status={status}>
      <div className="flex items-stretch">
        {item.due ? (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={done}
            aria-label={
              status === 'paid'
                ? `${position.name}: Haken entfernen`
                : status === 'skipped'
                  ? `${position.name}: entfallen – zurücksetzen`
                  : `${position.name} als bezahlt markieren`
            }
            className="focus-ring group flex w-14 shrink-0 items-center justify-center rounded-xl"
            data-testid="toggle-paid"
          >
            <CheckCircle state={status} />
          </button>
        ) : (
          <span className="w-14 shrink-0" aria-hidden="true" />
        )}
        {item.due ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`${position.name} – Details`}
            className="focus-ring flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 pr-4 text-left hover:bg-zinc-50"
          >
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[16px] font-medium transition-colors ${done ? 'text-ink-mute' : 'text-ink'}`}>
                {position.name}
              </span>
              {(schedule || payment?.note || status === 'skipped' || next) && (
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  {status === 'skipped' && <Badge>entfallen</Badge>}
                  {schedule && <Badge tone="accent">{schedule}</Badge>}
                  {next && (
                    <span data-testid="next-change">
                      <Badge>
                        Ab {formatIsoDate(effectiveDate(next))}: {formatEUR(next.amount)}
                      </Badge>
                    </span>
                  )}
                  {payment?.note && <span className="truncate text-[13px] text-ink-mute">{payment.note}</span>}
                </span>
              )}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={`num text-[16px] font-semibold ${done ? 'text-ink-soft' : 'text-ink'} ${status === 'skipped' ? 'line-through' : ''}`}
              >
                {formatEUR(amount)}
              </span>
              {item.delta !== null && <DeltaChip delta={item.delta} />}
            </span>
          </button>
        ) : (
          <div className="flex min-h-[48px] min-w-0 flex-1 items-center pr-4">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-medium text-ink-mute">{position.name}</span>
              <span className="block text-[13px] text-ink-faint">diesen Monat nicht fällig</span>
            </span>
          </div>
        )}
      </div>

      {item.oneOffs.map((o) => (
        <div key={o.id} className="flex items-stretch pb-1 pl-6" data-testid="oneoff-row" data-paid={!!o.paidAt}>
          <button
            type="button"
            onClick={() => onToggleOneOff(o)}
            aria-pressed={!!o.paidAt}
            aria-label={o.paidAt ? `${o.label}: Haken entfernen` : `${o.label} als bezahlt markieren`}
            className="focus-ring group flex w-11 shrink-0 items-center justify-center rounded-xl"
          >
            <CheckCircle state={o.paidAt ? 'paid' : 'open'} small />
          </button>
          <button
            type="button"
            onClick={() => onOpenOneOff(o)}
            aria-label={`${o.label} – bearbeiten`}
            className="focus-ring flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-xl py-1.5 pr-4 text-left hover:bg-zinc-50"
          >
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[14px] font-medium ${o.paidAt ? 'text-ink-mute' : 'text-ink-soft'}`}>{o.label}</span>
              <span className="text-[12px] text-ink-mute">{o.amount < 0 ? 'Gutschrift' : 'Nachzahlung'} · einmalig</span>
            </span>
            <span className={`num shrink-0 text-[14px] font-semibold ${o.amount < 0 ? 'text-paid' : 'text-ink-soft'}`}>
              {formatDelta(o.amount)}
            </span>
          </button>
        </div>
      ))}
    </li>
  );
}
