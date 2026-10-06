import { useState } from 'react';
import { db } from '../db/db';
import { changeAmount, RepoError, updatePlanEntry } from '../db/repo';
import {
  annualCostOfPlan,
  entryKey,
  monthlyEquivalentOfPlan,
  paymentFor,
  planForPeriod,
  planHistory,
} from '../lib/calc';
import { amountToInput, formatDelta, formatEUR, parseAmount } from '../lib/format';
import { monthName, periodLabel } from '../lib/period';
import type { Dataset, PlanEntry, Position } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { AmountField, DateField, PrimaryButton, SecondaryButton, TextField, todayIso } from './form';

interface Props {
  ds: Dataset;
  position: Position;
  /** edit this history entry; omitted = new change */
  entry?: PlanEntry;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: (entry: PlanEntry) => void;
  returnFocusTo?: HTMLElement | null;
}

/**
 * „Betrag ändern“: new amount valid from a date (past or future), optional reason.
 * Also edits an existing entry of the history. Never for one-time payments.
 */
export function AmountChangeSheet({ ds, position, entry, onClose, onSaved, onDelete, returnFocusTo }: Props) {
  const history = planHistory(position);
  const isFirst = !!entry && entry === history[0];
  const [amountText, setAmountText] = useState(entry ? amountToInput(entry.amount) : '');
  const [date, setDate] = useState(entry?.changedOn ?? todayIso());
  const [reason, setReason] = useState(entry?.reason ?? '');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amount = parseAmount(amountText);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const period = isFirst ? entry!.validFrom : validDate ? date.slice(0, 7) : null;
  const amountError =
    amountText.trim() === '' ? 'Bitte den neuen Betrag eingeben.' : amount === null ? 'Bitte einen Betrag eingeben, z. B. 12,50' : amount <= 0 ? 'Der Betrag muss größer als 0 sein.' : null;
  const valid = !amountError && (isFirst || validDate);

  // plan in force before the change (without the edited entry itself)
  const others: Position = { ...position, history: position.history.filter((e) => e !== entry) };
  const before = period ? (planForPeriod(others, period) ?? planHistory(others)[0] ?? null) : null;
  const next = before && amount !== null && amount > 0 ? { ...before, amount } : null;
  const monthlyDiff = before && next && !isFirst ? monthlyEquivalentOfPlan(next) - monthlyEquivalentOfPlan(before) : null;
  const yearlyDiff = before && next && !isFirst ? annualCostOfPlan(next) - annualCostOfPlan(before) : null;
  const ticked = period ? paymentFor(ds, position.id, period) : undefined;
  const tickedNote =
    ticked && ticked.status === 'paid' && amount !== null && Math.round(ticked.plannedAmount * 100) !== Math.round(amount * 100)
      ? `${monthName(period!)} bereits mit ${formatEUR(ticked.plannedAmount)} abgehakt – der Haken bleibt unverändert.`
      : null;

  async function save() {
    if (!valid || amount === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      const input = { amount, changedOn: date, reason };
      if (entry) await updatePlanEntry(db, position.id, entryKey(entry), input);
      else await changeAmount(db, position.id, input);
      onSaved();
    } catch (err) {
      setError(err instanceof RepoError ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      title={entry ? (isFirst ? 'Anfangsbetrag bearbeiten' : 'Änderung bearbeiten') : 'Betrag ändern'}
      subtitle={position.name}
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
        data-testid="amount-change-form"
      >
        <AmountField
          label={isFirst ? 'Betrag' : 'Neuer Betrag'}
          value={amountText}
          onChange={(v) => {
            setAmountText(v);
            setDirty(true);
          }}
          error={dirty ? amountError : null}
          hint={
            monthlyDiff !== null && yearlyDiff !== null ? (
              <span className="num" data-testid="change-preview">
                {before && <>bisher {formatEUR(before.amount)} · </>}
                {formatDelta(monthlyDiff)} / Monat · {formatDelta(yearlyDiff)} / Jahr
              </span>
            ) : undefined
          }
        />
        {isFirst ? (
          <p className="text-[14px] text-ink-mute">Gilt seit Beginn ({periodLabel(entry!.validFrom)}).</p>
        ) : (
          <DateField
            label="Gültig ab"
            value={date}
            onChange={setDate}
            error={!validDate ? 'Bitte ein Datum wählen.' : null}
            hint={period ? `gilt ab ${periodLabel(period)}` : undefined}
            testId="changed-on"
          />
        )}
        {tickedNote && (
          <p className="rounded-2xl bg-warn-soft px-3 py-2.5 text-[13px] text-warn" data-testid="ticked-note">
            {tickedNote}
          </p>
        )}
        <TextField label="Grund" optional value={reason} onChange={setReason} placeholder="z. B. Tarifwechsel, Indexanpassung" />
        {error && (
          <p role="alert" className="rounded-xl bg-over-soft px-3 py-2 text-[14px] text-over">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 pt-1">
          <PrimaryButton disabled={!valid || saving}>{entry ? 'Speichern' : 'Betrag ändern'}</PrimaryButton>
          {entry && !isFirst && onDelete && (
            <SecondaryButton danger onClick={() => onDelete(entry)}>
              Änderung löschen
            </SecondaryButton>
          )}
        </div>
      </form>
    </BottomSheet>
  );
}
