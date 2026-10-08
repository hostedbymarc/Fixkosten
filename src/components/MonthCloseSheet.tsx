import { useId, useState } from 'react';
import { freeAverageWith, freeCalculatedWith, gap, monthCloseFor } from '../lib/calc';
import { amountToInput, formatDelta, formatEUR, parseAmount } from '../lib/format';
import { addPeriods, periodLabel } from '../lib/period';
import type { Dataset, Period } from '../lib/types';
import type { MonthCloseInput } from '../db/repo';
import { BottomSheet } from './BottomSheet';

interface Props {
  ds: Dataset;
  period: Period;
  onClose: () => void;
  onSave: (input: MonthCloseInput) => void;
  returnFocusTo?: HTMLElement | null;
}

/** '' → undefined, invalid → null */
function parseOptional(text: string): number | undefined | null {
  return text.trim() === '' ? undefined : parseAmount(text);
}

function AmountField({
  label,
  value,
  onChange,
  placeholder,
  invalid,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid: boolean;
  hint?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-medium text-ink-soft">
        {label}
      </label>
      <div
        className={`flex h-14 items-center rounded-2xl border bg-field px-4 focus-within:ring-2 ${
          invalid ? 'border-over focus-within:ring-over/30' : 'border-edge focus-within:border-accent-ink focus-within:ring-focus/25'
        }`}
      >
        <span className="mr-2 text-[20px] text-ink-mute">€</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          className="num h-full w-full bg-transparent text-[22px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
        />
      </div>
      <p id={`${id}-hint`} className="mt-1.5 min-h-[20px] text-[13px] text-ink-mute">
        {invalid ? <span className="text-over">Bitte einen Betrag eingeben, z. B. 4.850,50</span> : hint}
      </p>
    </div>
  );
}

/** Month close: net salary, actually free money and a note. Nothing is saved automatically. */
export function MonthCloseSheet({ ds, period, onClose, onSave, returnFocusTo }: Props) {
  const current = monthCloseFor(ds, period);
  const previous = monthCloseFor(ds, addPeriods(period, -1));

  const [salaryText, setSalaryText] = useState(current?.netSalary !== undefined ? amountToInput(current.netSalary) : '');
  const [freeText, setFreeText] = useState(current?.freeActual !== undefined ? amountToInput(current.freeActual) : '');
  const [note, setNote] = useState(current?.note ?? '');
  const noteId = useId();

  const salary = parseOptional(salaryText);
  const freeActual = parseOptional(freeText);
  const invalid = salary === null || freeActual === null;
  const calculated = typeof salary === 'number' ? freeCalculatedWith(ds, period, salary) : null;
  const difference = gap(freeActual, calculated);
  const average = typeof salary === 'number' ? freeAverageWith(ds, period, salary) : null;

  const prevSalary = previous?.netSalary;
  const prevFree = previous?.freeActual;
  const canCopyPrevious =
    (prevSalary !== undefined && salaryText.trim() === '') || (prevFree !== undefined && freeText.trim() === '');

  return (
    <BottomSheet
      title={`Monatsabschluss ${periodLabel(period)}`}
      subtitle="Netto-Gehalt und was tatsächlich übrig bleibt"
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid) return;
          onSave({ netSalary: salary ?? undefined, freeActual: freeActual ?? undefined, note });
        }}
      >
        {canCopyPrevious && (
          <button
            type="button"
            onClick={() => {
              if (prevSalary !== undefined && salaryText.trim() === '') setSalaryText(amountToInput(prevSalary));
              if (prevFree !== undefined && freeText.trim() === '') setFreeText(amountToInput(prevFree));
            }}
            className="focus-ring self-start rounded-xl bg-accent-soft px-3 py-2.5 text-[14px] font-semibold text-accent-strong hover:bg-accent-soft-hover"
          >
            Wie Vormonat
          </button>
        )}

        <AmountField
          label="Netto-Gehalt"
          value={salaryText}
          onChange={setSalaryText}
          placeholder={prevSalary !== undefined ? amountToInput(prevSalary) : undefined}
          invalid={salary === null}
          hint={prevSalary !== undefined ? <>Vormonat: <span className="num">{formatEUR(prevSalary)}</span></> : undefined}
        />

        <AmountField
          label="Frei verfügbar (tatsächlich)"
          value={freeText}
          onChange={setFreeText}
          placeholder={prevFree !== undefined ? amountToInput(prevFree) : undefined}
          invalid={freeActual === null}
          hint={
            calculated !== null ? (
              <span data-testid="close-preview">
                Rechnerisch <span className="num font-medium text-ink-soft">{formatEUR(calculated)}</span>
                {difference !== null && (
                  <>
                    {' · '}Differenz{' '}
                    <span className={`num font-medium ${difference < 0 ? 'text-over' : 'text-ink-soft'}`}>
                      {formatDelta(difference)}
                    </span>
                  </>
                )}
              </span>
            ) : prevFree !== undefined ? (
              <>Vormonat: <span className="num">{formatEUR(prevFree)}</span></>
            ) : undefined
          }
        />

        {average !== null && calculated !== null && (
          <p className="-mt-1 rounded-2xl bg-zinc-50 px-3 py-2.5 text-[13px] leading-snug text-ink-soft" data-testid="close-average">
            Rechnerisch frei <span className="font-medium">diesen Monat</span>{' '}
            <span className="num font-semibold text-ink">{formatEUR(calculated)}</span> · im{' '}
            <span className="font-medium">Ø-Monat</span> (alle Kosten umgelegt){' '}
            <span className="num font-semibold text-ink">{formatEUR(average)}</span>
          </p>
        )}

        <div>
          <label htmlFor={noteId} className="mb-1.5 block text-[14px] font-medium text-ink-soft">
            Notiz <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <textarea
            id={noteId}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Bonus, Urlaub …"
            className="w-full resize-none rounded-2xl border border-edge bg-field px-4 py-3 text-[16px] text-ink outline-none placeholder:text-ink-faint focus:border-accent-ink focus:ring-2 focus:ring-accent-ink/20"
          />
        </div>

        <button
          type="submit"
          disabled={invalid}
          className="focus-ring mt-1 h-12 rounded-2xl bg-accent text-[16px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
        >
          Speichern
        </button>
      </form>
    </BottomSheet>
  );
}
