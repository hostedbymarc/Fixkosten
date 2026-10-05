import type { DueItem } from '../lib/calc';
import { formatEUR } from '../lib/format';
import { Badge, DeltaChip, scheduleLabel } from './Chips';

interface Props {
  item: DueItem;
  onToggle: () => void;
  onOpen: () => void;
}

function CheckCircle({ checked }: { checked: boolean }) {
  return checked ? (
    <span className="anim-check flex h-[26px] w-[26px] items-center justify-center rounded-full bg-paid text-white">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M3 7.2l2.6 2.6L11 4.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ) : (
    <span className="h-[26px] w-[26px] rounded-full border-[1.75px] border-zinc-300 bg-white transition-colors group-hover:border-accent" />
  );
}

export function PositionRow({ item, onToggle, onOpen }: Props) {
  const { position, payment } = item;
  const paid = Boolean(payment);
  const schedule = scheduleLabel(position);
  const amount = payment ? payment.actualAmount : item.planned;

  return (
    <li className="flex items-stretch" data-testid="position-row" data-position={position.id} data-paid={paid}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={paid}
        aria-label={paid ? `${position.name}: Haken entfernen` : `${position.name} als bezahlt markieren`}
        className="focus-ring group flex w-14 shrink-0 items-center justify-center rounded-xl"
        data-testid="toggle-paid"
      >
        <CheckCircle checked={paid} />
      </button>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${position.name} – Details`}
        className="focus-ring flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 pr-4 text-left hover:bg-zinc-50"
      >
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[16px] font-medium transition-colors ${
              paid ? 'text-ink-mute' : 'text-ink'
            }`}
          >
            {position.name}
          </span>
          {(schedule || payment?.note) && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              {schedule && <Badge tone="accent">{schedule}</Badge>}
              {payment?.note && <span className="truncate text-[13px] text-ink-mute">{payment.note}</span>}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={`num text-[16px] font-semibold ${paid ? 'text-ink-soft' : 'text-ink'}`}>
            {formatEUR(amount)}
          </span>
          {item.delta !== null && <DeltaChip delta={item.delta} />}
        </span>
      </button>
    </li>
  );
}
