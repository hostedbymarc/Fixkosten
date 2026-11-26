// polster-feinschliff: „Betrag für {Monat}“ – a tap on a line of „Dein Monat“ (① – ④) or on an amount in the
// categories. A recurring position: the amount and „Nur {Monat}“ / „Ab {Monat}“; a one-time payment: the amount and
// its date; a one-off of a month: the amount. „Spielgeld für {Monat}“: „Nur {Monat}“ (spielgeldOverrides) or
// „Ab {Monat}“ (the Spielgeld in the settings). Every number of the card, the Polster preview and „Dein Plan“
// follows at once (they read the database live).
import { useEffect, useId, useState } from 'react';
import { db } from '../../db/db';
import { setSpielgeldFor } from '../../db/kontoActions';
import { changePlan, RepoError, saveOneOff, setMonthAmount } from '../../db/repo';
import { useKonto } from '../../db/useKonto';
import { onOpenAmount, type AmountTarget, type OpenAmount } from '../../lib/amountBus';
import { currentPlan, planForPeriod } from '../../lib/calc';
import { amountToInput, currencySymbol, parseAmount } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import { monthName } from '../../lib/period';
import type { Dataset, Period } from '../../lib/types';
import { closePopover } from '../../lib/popoverBus';
import { BottomSheet } from '../BottomSheet';
import { AmountInput, DateField } from '../form';

const PRIMARY =
  'focus-ring press inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-accent px-5 text-[16px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40';
const TEXT_BUTTON = 'focus-ring inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[15px] font-semibold text-ink-soft';

/** The one place „Betrag für {Monat}“ lives (mounted once in the app). */
export function MonthAmountHost({ ds, active }: { ds: Dataset; active: Period }) {
  const [open, setOpen] = useState<OpenAmount | null>(null);
  useEffect(
    () =>
      onOpenAmount((o) => {
        closePopover();
        setOpen(o);
      }),
    [],
  );
  if (!open) return null;
  return <MonthAmountSheet ds={ds} active={active} target={open.target} returnFocusTo={open.returnFocusTo} onClose={() => setOpen(null)} />;
}

type Edit = { title: string; amount: number; scope: boolean; date?: string; save: (amount: number, scope: 'only' | 'from', date?: string) => Promise<void> };

function editOf(ds: Dataset, target: AmountTarget, spielgeld: number | null, overrides: Partial<Record<Period, number>>, active: Period): Edit | null {
  const monat = monthName(target.period);
  if (target.kind === 'spielgeld') {
    const own = overrides[target.period];
    return {
      title: t('spielgeld.title', { monat }),
      amount: own !== undefined ? own / 100 : (spielgeld ?? 0),
      scope: true,
      save: (amount, scope) => setSpielgeldFor(db, target.period, Math.round(amount * 100), scope, active),
    };
  }
  if (target.kind === 'oneOff') {
    const o = ds.oneOffs.find((x) => x.id === target.oneOffId);
    if (!o || !o.positionId) return null;
    return {
      title: t('amount.title', { monat }),
      amount: Math.abs(o.amount),
      scope: false,
      save: async (amount) => {
        await saveOneOff(db, { positionId: o.positionId!, period: o.period, amount, credit: o.amount < 0, label: o.label }, o.id);
      },
    };
  }
  const position = ds.positions.find((p) => p.id === target.positionId);
  if (!position) return null;
  const plan = planForPeriod(position, target.period) ?? currentPlan(position, target.period);
  if (!plan) return null;
  if (plan.frequency === 'once')
    return {
      title: t('amount.title', { monat }),
      amount: plan.amount,
      scope: false,
      date: plan.dueDate,
      save: async (amount, _scope, date) => {
        const { validFrom: _v, ...rest } = plan;
        await changePlan(db, position.id, { ...rest, amount, dueDate: date ?? plan.dueDate }, { type: 'once' }, target.period);
      },
    };
  return {
    title: t('amount.title', { monat }),
    amount: plan.amount,
    scope: true,
    save: (amount, scope) => setMonthAmount(db, position.id, target.period, amount, scope),
  };
}

export function MonthAmountSheet({
  ds,
  active,
  target,
  onClose,
  returnFocusTo,
}: {
  ds: Dataset;
  active: Period;
  target: AmountTarget;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}) {
  const { settings } = useKonto();
  // read once: the sheet edits what was tapped, even while the data changes behind it
  const [edit] = useState(() => editOf(ds, target, settings.spielgeld, settings.spielgeldOverrides, active));
  const [text, setText] = useState(edit ? amountToInput(edit.amount) : '');
  const [scope, setScope] = useState<'only' | 'from'>('only');
  const [date, setDate] = useState(edit?.date ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fieldId = useId();
  if (!edit) return null;
  const value = parseAmount(text);
  const spielgeld = target.kind === 'spielgeld';
  // the Spielgeld may be 0, an amount of a position must be above 0
  const valid = value !== null && (spielgeld ? value >= 0 : value > 0) && (edit.date === undefined || /^\d{4}-\d{2}-\d{2}$/.test(date));
  const monat = monthName(target.period);
  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await edit.save(value!, scope, edit.date === undefined ? undefined : date);
      onClose();
    } catch (e) {
      setError(e instanceof RepoError ? e.message : String(e));
      setSaving(false);
    }
  };
  return (
    <BottomSheet title={edit.title} onClose={onClose} returnFocusTo={returnFocusTo}>
      <form
        className="flex flex-col gap-4 pb-1"
        data-testid="amount-sheet"
        data-kind={target.kind}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div>
          <label htmlFor={fieldId} className="sr-only">
            {edit.title}
          </label>
          <span className="flex h-14 items-center rounded-2xl border border-edge bg-field px-4 focus-within:ring-2 focus-within:ring-focus/25">
            <span className="mr-2 text-[20px] text-ink-mute">{currencySymbol()}</span>
            <AmountInput
              id={fieldId}
              value={text}
              onChange={setText}
              onFocus={(e) => e.currentTarget.select()}
              enterKeyHint="done"
              className="num h-full w-full min-w-0 bg-transparent text-[22px] font-semibold text-ink outline-none"
              data-testid="amount-input"
            />
          </span>
        </div>
        {edit.scope && (
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-control p-1" role="radiogroup" aria-label={edit.title} data-testid="amount-scope" data-scope={scope}>
            {(['only', 'from'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={scope === s}
                onClick={() => setScope(s)}
                className={`focus-ring min-h-11 rounded-xl px-3 text-[15px] font-semibold ${scope === s ? 'bg-raised text-ink shadow-card' : 'text-ink-soft'}`}
                data-testid={`amount-scope-${s}`}
              >
                {t(s === 'only' ? 'amount.only' : 'amount.from', { monat })}
              </button>
            ))}
          </div>
        )}
        {edit.date !== undefined && <DateField label={t('amount.date')} value={date} onChange={setDate} testId="amount-date" />}
        {error && (
          <p className="text-[14px] text-over" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button type="submit" className={PRIMARY} disabled={!valid || saving} data-testid="amount-save">
            {t('amount.save')}
          </button>
          <button type="button" className={TEXT_BUTTON} onClick={onClose} data-testid="amount-cancel">
            {t('amount.cancel')}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
