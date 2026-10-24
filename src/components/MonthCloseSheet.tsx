import { useId, useState } from 'react';
import { freeAfterFixedAvgWith, freeAfterFixedWith, monthCloseFor } from '../lib/calc';
import { amountToInput, formatAvg, formatEUR, parseAmount } from '../lib/format';
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

/** Month close: net salary of the month. Nothing is saved automatically; the month note has its own card. */
export function MonthCloseSheet({ ds, period, onClose, onSave, returnFocusTo }: Props) {
  const current = monthCloseFor(ds, period);
  const previous = monthCloseFor(ds, addPeriods(period, -1));

  const [salaryText, setSalaryText] = useState(current?.netSalary !== undefined ? amountToInput(current.netSalary) : '');

  const salary = parseOptional(salaryText);
  const invalid = salary === null;
  const calculated = typeof salary === 'number' ? freeAfterFixedWith(ds, period, salary) : null;
  const average = typeof salary === 'number' ? freeAfterFixedAvgWith(ds, period, salary) : null;

  const prevSalary = previous?.netSalary;
  const canCopyPrevious = prevSalary !== undefined && salaryText.trim() === '';

  return (
    <BottomSheet
      title={`Monatsabschluss ${periodLabel(period)}`}
      subtitle="Netto-Gehalt des Monats"
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid) return;
          onSave({ netSalary: salary ?? undefined });
        }}
      >
        {canCopyPrevious && (
          <button
            type="button"
            onClick={() => {
              if (prevSalary !== undefined) setSalaryText(amountToInput(prevSalary));
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

        {average !== null && calculated !== null && (
          <p className="rounded-2xl bg-zinc-50 px-3 py-2.5 text-[13px] leading-snug text-ink-soft" data-testid="close-average">
            Rechnerisch frei <span className="font-medium">diesen Monat</span>{' '}
            <span className={`num whitespace-nowrap font-semibold ${calculated < 0 ? 'text-over' : 'text-ink'}`} data-testid="close-calculated">
              {formatEUR(calculated)}
            </span>{' '}
            · im <span className="font-medium">Ø-Monat</span>{' '}
            <span className={`num whitespace-nowrap font-semibold ${average < 0 ? 'text-over' : 'text-ink'}`} data-testid="close-average-value">
              {formatAvg(average)}
            </span>
            , jeweils nach den Fixkosten und dem Vermögensaufbau
          </p>
        )}

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
