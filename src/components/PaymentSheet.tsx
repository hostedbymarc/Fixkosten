import { useId, useState } from 'react';
import type { DueItem } from '../lib/calc';
import { amountToInput, formatDate, formatDelta, formatEUR, parseAmount } from '../lib/format';
import { periodLabel } from '../lib/period';
import { BottomSheet } from './BottomSheet';

interface Props {
  item: DueItem;
  onClose: () => void;
  onSave: (actualAmount: number, note: string) => void;
  onUnpay: () => void;
}

/** Tap on a row: set actual amount, note, or remove the tick. */
export function PaymentSheet({ item, onClose, onSave, onUnpay }: Props) {
  const { payment, planned, position } = item;
  const [amountText, setAmountText] = useState(amountToInput(payment?.actualAmount ?? planned));
  const [note, setNote] = useState(payment?.note ?? '');
  const amountId = useId();
  const noteId = useId();

  const parsed = parseAmount(amountText);
  const invalid = parsed === null;
  const delta = parsed !== null ? parsed - planned : 0;

  return (
    <BottomSheet
      title={position.name}
      subtitle={
        <>
          Plan <span className="num">{formatEUR(planned)}</span> · {periodLabel(item.period)}
          {payment && <> · bezahlt am {formatDate(payment.paidAt)}</>}
        </>
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed !== null) onSave(parsed, note);
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label htmlFor={amountId} className="mb-1.5 block text-[14px] font-medium text-ink-soft">
            Tatsächlich abgebucht
          </label>
          <div
            className={`flex h-14 items-center rounded-2xl border bg-white px-4 focus-within:ring-2 ${
              invalid ? 'border-over focus-within:ring-over/30' : 'border-line focus-within:border-accent focus-within:ring-accent/20'
            }`}
          >
            <span className="mr-2 text-[20px] text-ink-mute">€</span>
            <input
              id={amountId}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              aria-invalid={invalid}
              aria-describedby={`${amountId}-hint`}
              className="num w-full bg-transparent text-[22px] font-semibold text-ink outline-none"
            />
          </div>
          <p id={`${amountId}-hint`} className="mt-1.5 min-h-[20px] text-[13px] text-ink-mute">
            {invalid ? (
              <span className="text-over">Bitte einen Betrag eingeben, z. B. 12,50</span>
            ) : Math.round(delta * 100) !== 0 ? (
              <span className={delta > 0 ? 'text-over' : 'text-paid'}>
                <span className="num">{formatDelta(delta)}</span> gegenüber Plan
              </span>
            ) : position.isVariable ? (
              'Variabler Betrag – Ist-Wert eintragen, sobald bekannt.'
            ) : (
              'Entspricht dem Planbetrag.'
            )}
          </p>
        </div>

        <div>
          <label htmlFor={noteId} className="mb-1.5 block text-[14px] font-medium text-ink-soft">
            Notiz
          </label>
          <textarea
            id={noteId}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Nachzahlung, Preiserhöhung …"
            className="w-full resize-none rounded-2xl border border-line px-4 py-3 text-[16px] text-ink outline-none placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="submit"
            disabled={invalid}
            className="focus-ring h-12 rounded-2xl bg-accent text-[16px] font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
          >
            {payment ? 'Speichern' : 'Als bezahlt speichern'}
          </button>
          {payment && (
            <button
              type="button"
              onClick={onUnpay}
              className="focus-ring h-12 rounded-2xl text-[16px] font-medium text-ink-soft hover:bg-zinc-100"
            >
              Haken entfernen
            </button>
          )}
        </div>
      </form>
    </BottomSheet>
  );
}
