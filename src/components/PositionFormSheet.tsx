import { useMemo, useState } from 'react';
import { db } from '../db/db';
import { changePlan, createPosition, updatePositionInfo, type PlanInput } from '../db/repo';
import {
  ALL_MONTHS,
  currentPlan,
  defaultDueMonths,
  monthlyEquivalentOfPlan,
  samePlan,
  sortedCategories,
} from '../lib/calc';
import { amountToInput, formatEUR, parseAmount } from '../lib/format';
import { monthOf, periodLabel, shortMonthName } from '../lib/period';
import type { Dataset, Frequency, Period, Position } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { FREQUENCY_LABEL } from './Chips';
import {
  AmountField,
  MonthChips,
  monthOptions,
  PrimaryButton,
  Segmented,
  SelectField,
  TextField,
} from './form';

interface Props {
  ds: Dataset;
  today: Period;
  /** edit an existing position; omitted = create */
  position?: Position;
  onClose: () => void;
  onSaved: (positionId: string) => void;
  returnFocusTo?: HTMLElement | null;
}

const FREQUENCIES: Frequency[] = ['monthly', 'quarterly', 'semiannual', 'annual'];

/** Create or edit a position. Plan changes on existing positions ask "Ab wann gilt das?". */
export function PositionFormSheet({ ds, today, position, onClose, onSaved, returnFocusTo }: Props) {
  const categories = sortedCategories(ds);
  const plan = position ? currentPlan(position, today) : null;

  const [name, setName] = useState(position?.name ?? '');
  const [categoryId, setCategoryId] = useState(position?.categoryId ?? categories.find((c) => c.kind === 'expense')?.id ?? categories[0]?.id ?? '');
  const [amountText, setAmountText] = useState(plan ? amountToInput(plan.amount) : '');
  const [frequency, setFrequency] = useState<Frequency>(plan?.frequency ?? 'monthly');
  const [dueMonths, setDueMonths] = useState<number[]>(
    plan && plan.frequency !== 'monthly' ? plan.dueMonths : defaultDueMonths('quarterly', monthOf(today)),
  );
  const [startMonth, setStartMonth] = useState<number>(plan && plan.frequency !== 'monthly' ? plan.dueMonths[0]! : monthOf(today));
  const [dueDayText, setDueDayText] = useState(plan?.dueDay ? String(plan.dueDay) : '');
  const [note, setNote] = useState(position?.note ?? '');
  const [validFrom, setValidFrom] = useState<Period>(today);
  const [changeMode, setChangeMode] = useState<'from' | 'correct'>('from');
  const [fromPeriod, setFromPeriod] = useState<Period>(today);
  // inline errors appear once a field was edited; the save button stays disabled until valid
  const [dirty, setDirty] = useState({ name: false, amount: false });
  const [saving, setSaving] = useState(false);

  const amount = parseAmount(amountText);
  const dueDay = dueDayText.trim() === '' ? undefined : Number(dueDayText);
  const errors = {
    name: name.trim() === '' ? 'Bitte einen Namen eingeben.' : null,
    amount:
      amountText.trim() === ''
        ? 'Bitte einen Betrag eingeben.'
        : amount === null
          ? 'Bitte einen Betrag eingeben, z. B. 12,50'
          : amount <= 0
            ? 'Der Betrag muss größer als 0 sein.'
            : null,
    months: frequency !== 'monthly' && dueMonths.length === 0 ? 'Mindestens einen Monat wählen.' : null,
    dueDay:
      dueDay !== undefined && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) ? 'Tag zwischen 1 und 31.' : null,
  };
  const valid = !Object.values(errors).some(Boolean) && categoryId !== '';

  const nextPlan: PlanInput | null =
    amount !== null && amount > 0
      ? { amount, frequency, dueMonths: frequency === 'monthly' ? ALL_MONTHS : dueMonths, ...(dueDay ? { dueDay } : {}) }
      : null;
  const planChanged = !!(position && plan && nextPlan && !samePlan(nextPlan, plan));
  const equivalent = useMemo(() => (nextPlan ? monthlyEquivalentOfPlan({ validFrom: today, ...nextPlan }) : null), [nextPlan, today]);

  function chooseFrequency(f: Frequency) {
    setFrequency(f);
    if (f !== 'monthly') setDueMonths(defaultDueMonths(f, startMonth));
  }

  function chooseStart(m: number) {
    setStartMonth(m);
    if (frequency !== 'monthly') setDueMonths(defaultDueMonths(frequency, m));
  }

  async function save() {
    if (!valid || !nextPlan || saving) return;
    setSaving(true);
    try {
      if (!position) {
        const id = await createPosition(db, { name, categoryId, note, plan: nextPlan }, validFrom);
        onSaved(id);
        return;
      }
      await updatePositionInfo(db, position.id, { name, categoryId, note });
      if (planChanged) {
        await changePlan(db, position.id, nextPlan, changeMode === 'from' ? { type: 'from', validFrom: fromPeriod } : { type: 'correct' }, today);
      }
      onSaved(position.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      title={position ? 'Position bearbeiten' : 'Neue Position'}
      subtitle={position ? position.name : 'Fixkosten oder Sparplan anlegen'}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        data-testid="position-form"
      >
        <TextField
          label="Name"
          value={name}
          onChange={(v) => {
            setName(v);
            setDirty((d) => ({ ...d, name: true }));
          }}
          placeholder="z. B. Versicherung"
          error={dirty.name ? errors.name : null}
        />
        <SelectField
          label="Kategorie"
          value={categoryId}
          onChange={setCategoryId}
          options={categories.map((c) => ({ value: c.id, label: c.kind === 'savings' ? `${c.name} (Sparen)` : c.name }))}
        />
        <AmountField
          label="Betrag"
          value={amountText}
          onChange={(v) => {
            setAmountText(v);
            setDirty((d) => ({ ...d, amount: true }));
          }}
          error={dirty.amount ? errors.amount : null}
          hint={
            equivalent !== null && frequency !== 'monthly' ? (
              <>
                Ø <span className="num">{formatEUR(equivalent)}</span> pro Monat
              </>
            ) : undefined
          }
        />
        <Segmented
          label="Häufigkeit"
          value={frequency}
          onChange={chooseFrequency}
          options={FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))}
        />
        {frequency !== 'monthly' && (
          <>
            <SelectField
              label="Startmonat"
              value={String(startMonth)}
              onChange={(v) => chooseStart(Number(v))}
              options={ALL_MONTHS.map((m) => ({ value: String(m), label: shortMonthName(m) }))}
              hint="Setzt die Fälligkeitsmonate automatisch – darunter einzeln anpassbar."
            />
            <MonthChips label="Fällig in" value={dueMonths} onChange={setDueMonths} error={errors.months} />
          </>
        )}
        <TextField
          label="Fälligkeitstag"
          optional
          inputMode="numeric"
          value={dueDayText}
          onChange={(v) => setDueDayText(v.replace(/[^0-9]/g, '').slice(0, 2))}
          placeholder="1–31"
          error={errors.dueDay}
          hint="31 = letzter Tag des Monats"
        />
        <TextField label="Notiz" optional multiline value={note} onChange={setNote} placeholder="z. B. Vertrag bis 2027" />

        {!position && (
          <SelectField label="Gilt ab" value={validFrom} onChange={setValidFrom} options={monthOptions(today)} />
        )}

        {planChanged && (
          <fieldset className="rounded-2xl border border-accent/40 bg-accent-soft/60 p-3" data-testid="change-mode">
            <legend className="px-1 text-[14px] font-semibold text-ink">Betrag oder Zahlungsplan geändert</legend>
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl p-2">
              <input
                type="radio"
                name="change-mode"
                checked={changeMode === 'from'}
                onChange={() => setChangeMode('from')}
                className="mt-1 h-5 w-5 accent-[#5B5BD6]"
              />
              <span className="flex-1">
                <span className="block text-[15px] font-medium text-ink">Ab wann gilt das?</span>
                <span className="block text-[13px] text-ink-mute">Frühere Monate bleiben unverändert. Zählt als Optimierung bzw. Erhöhung.</span>
              </span>
            </label>
            {changeMode === 'from' && (
              <div className="px-2 pb-2">
                <SelectField label="Gilt ab" value={fromPeriod} onChange={setFromPeriod} options={monthOptions(today)} />
              </div>
            )}
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl p-2">
              <input
                type="radio"
                name="change-mode"
                checked={changeMode === 'correct'}
                onChange={() => setChangeMode('correct')}
                className="mt-1 h-5 w-5 accent-[#5B5BD6]"
              />
              <span className="flex-1">
                <span className="block text-[15px] font-medium text-ink">Tippfehler korrigieren</span>
                <span className="block text-[13px] text-ink-mute">
                  Überschreibt den Plan seit {periodLabel(plan!.validFrom)}. Keine Optimierung, abgehakte Monate bleiben.
                </span>
              </span>
            </label>
          </fieldset>
        )}

        <div className="pt-1">
          <PrimaryButton disabled={!valid || saving}>{position ? 'Speichern' : 'Position anlegen'}</PrimaryButton>
        </div>
      </form>
    </BottomSheet>
  );
}
