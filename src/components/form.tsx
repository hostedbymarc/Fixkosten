import { useId, type ReactNode } from 'react';
import { parseAmount } from '../lib/format';
import { addPeriods, periodLabel, shortMonthName } from '../lib/period';
import type { Period } from '../lib/types';

/** '' → undefined, invalid → null */
export function parseOptionalAmount(text: string): number | undefined | null {
  return text.trim() === '' ? undefined : parseAmount(text);
}

const labelClass = 'mb-1.5 block text-[14px] font-medium text-ink-soft';
const hintClass = 'mt-1.5 min-h-[20px] text-[13px] text-ink-mute';
const boxClass = (invalid: boolean) =>
  `rounded-2xl border bg-surface focus-within:ring-2 ${
    invalid ? 'border-over focus-within:ring-over/30' : 'border-line focus-within:border-accent-ink focus-within:ring-accent-ink/20'
  }`;

export function AmountField({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** shown in red; the field is marked invalid */
  error?: string | null;
  hint?: ReactNode;
  testId?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className={`flex h-14 items-center px-4 ${boxClass(!!error)}`}>
        <span className="mr-2 text-[20px] text-ink-mute">€</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          data-testid={testId}
          className="num h-full w-full bg-transparent text-[22px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
        />
      </div>
      <p id={`${id}-hint`} className={hintClass}>
        {error ? <span className="text-over">{error}</span> : hint}
      </p>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  multiline,
  inputMode,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: ReactNode;
  multiline?: boolean;
  inputMode?: 'numeric' | 'text';
  optional?: boolean;
}) {
  const id = useId();
  const common = {
    id,
    value,
    placeholder,
    'aria-invalid': !!error,
    'aria-describedby': error || hint ? `${id}-hint` : undefined,
    className: 'w-full bg-transparent px-4 text-[16px] text-ink outline-none placeholder:text-ink-faint',
  };
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label} {optional && <span className="font-normal text-ink-faint">(optional)</span>}
      </label>
      <div className={boxClass(!!error)}>
        {multiline ? (
          <textarea {...common} rows={2} onChange={(e) => onChange(e.target.value)} className={`${common.className} resize-none py-3`} />
        ) : (
          <input
            {...common}
            autoComplete="off"
            inputMode={inputMode}
            onChange={(e) => onChange(e.target.value)}
            className={`${common.className} h-12`}
          />
        )}
      </div>
      {(error || hint) && (
        <p id={`${id}-hint`} className={hintClass}>
          {error ? <span className="text-over">{error}</span> : hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className={`relative ${boxClass(false)}`}>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-full appearance-none bg-transparent pl-4 pr-10 text-[16px] text-ink outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-mute" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

/** Month options around `center` (−12 … +12) for "Gilt ab" / "Ab wann" selects. */
export function monthOptions(center: Period, before = 12, after = 12): { value: string; label: string }[] {
  const out = [];
  for (let i = -before; i <= after; i++) {
    const p = addPeriods(center, i);
    out.push({ value: p, label: periodLabel(p) });
  }
  return out;
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  gridClass,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  /** Tailwind grid columns (e.g. wrap to 3 per row on phones); default: one row */
  gridClass?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <div id={id} className={labelClass}>
        {label}
      </div>
      <div
        className={`grid gap-1 rounded-2xl bg-zinc-100 p-1 ${gridClass ?? ''}`}
        style={gridClass ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={`focus-ring min-h-[44px] rounded-xl px-1 text-[14px] font-medium ${
                active ? 'bg-raised font-semibold text-ink shadow-card' : 'text-ink-mute hover:text-ink'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Jan–Dez toggle chips, two rows of six (≥ 44 px wide in every viewport). */
export function MonthChips({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: number[];
  onChange: (months: number[]) => void;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} aria-describedby={`${id}-hint`}>
      <div id={id} className={labelClass}>
        {label}
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const active = value.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? value.filter((x) => x !== m) : [...value, m].sort((a, b) => a - b))}
              className={`focus-ring h-11 rounded-xl border text-[14px] font-medium ${
                active ? 'border-accent bg-accent btn-gloss text-white' : 'border-line bg-surface text-ink-soft hover:border-zinc-300'
              }`}
            >
              {shortMonthName(m)}
            </button>
          );
        })}
      </div>
      <p id={`${id}-hint`} className={hintClass}>
        {error && <span className="text-over">{error}</span>}
      </p>
    </div>
  );
}

export function PrimaryButton({ children, disabled, type = 'submit', onClick, danger }: {
  children: ReactNode;
  disabled?: boolean;
  type?: 'submit' | 'button';
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`focus-ring h-12 w-full rounded-2xl text-[16px] font-semibold text-white disabled:opacity-40 ${
        danger ? 'bg-danger hover:bg-danger-hover' : 'bg-accent btn-gloss hover:bg-accent-hover'
      }`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, danger, testId }: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`focus-ring h-12 w-full rounded-2xl text-[16px] font-medium hover:bg-zinc-100 ${danger ? 'text-over' : 'text-ink-soft'}`}
    >
      {children}
    </button>
  );
}

/**
 * Native date input (iOS shows its wheel picker). Value is 'YYYY-MM-DD';
 * the hint repeats the date as TT.MM.JJJJ with the weekday.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  hint?: ReactNode;
  testId?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className={boxClass(!!error)}>
        <input
          id={id}
          type="date"
          lang="de-AT"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          data-testid={testId}
          className="num h-12 w-full min-w-0 appearance-none bg-transparent px-4 text-[16px] text-ink outline-none"
        />
      </div>
      {/* the field itself follows the device language; the hint always shows TT.MM.JJJJ */}
      <p id={`${id}-hint`} className={hintClass} data-testid={testId ? `${testId}-hint` : undefined}>
        {error ? (
          <span className="text-over">{error}</span>
        ) : (
          <>
            {value && <span className="num">{longDate(value)}</span>}
            {value && hint && ' · '}
            {hint}
          </>
        )}
      </p>
    </div>
  );
}

const longDateFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

/** '2026-11-15' → 'Sonntag, 15.11.2026' */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return longDateFormat.format(new Date(y, m - 1, d));
}

/** Local calendar date of today as 'YYYY-MM-DD'. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
