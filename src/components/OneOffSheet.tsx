import { useState } from 'react';
import { db } from '../db/db';
import { saveOneOff } from '../db/repo';
import { amountToInput, parseAmount } from '../lib/format';
import type { OneOff, Period, Position } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { AmountField, monthOptions, PrimaryButton, SecondaryButton, Segmented, SelectField, TextField } from './form';

interface Props {
  position: Position;
  period: Period;
  oneOff?: OneOff;
  onClose: () => void;
  onDelete?: (oneOff: OneOff) => void;
  returnFocusTo?: HTMLElement | null;
}

/** Nachzahlung or Gutschrift for a position in one month. Never part of the plan. */
export function OneOffSheet({ position, period, oneOff, onClose, onDelete, returnFocusTo }: Props) {
  const [type, setType] = useState<'charge' | 'credit'>(oneOff && oneOff.amount < 0 ? 'credit' : 'charge');
  const [amountText, setAmountText] = useState(oneOff ? amountToInput(Math.abs(oneOff.amount)) : '');
  const [month, setMonth] = useState<Period>(oneOff?.period ?? period);
  const [label, setLabel] = useState(oneOff?.label ?? '');
  const [dirty, setDirty] = useState(false);

  const amount = parseAmount(amountText);
  const amountError = amount === null ? 'Bitte einen Betrag eingeben, z. B. 120' : amount <= 0 ? 'Der Betrag muss größer als 0 sein.' : null;
  const labelError = label.trim() === '' ? 'Bitte eine Bezeichnung eingeben.' : null;
  const valid = !amountError && !labelError;

  return (
    <BottomSheet
      title={oneOff ? 'Einmalbetrag bearbeiten' : 'Einmalbetrag hinzufügen'}
      subtitle={`${position.name} · zählt nicht zu den Fixkosten`}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || amount === null) return;
          void saveOneOff(db, { positionId: position.id, period: month, amount, credit: type === 'credit', label }, oneOff?.id).then(onClose);
        }}
        data-testid="oneoff-form"
      >
        <Segmented
          label="Art"
          value={type}
          onChange={setType}
          options={[
            { value: 'charge', label: 'Nachzahlung' },
            { value: 'credit', label: 'Gutschrift' },
          ]}
        />
        <AmountField
          label="Betrag"
          value={amountText}
          onChange={(v) => {
            setAmountText(v);
            setDirty(true);
          }}
          error={dirty ? amountError : null}
          hint={type === 'credit' ? 'Wird abgezogen.' : 'Kommt in diesem Monat dazu.'}
        />
        <SelectField label="Monat" value={month} onChange={setMonth} options={monthOptions(period)} />
        <TextField label="Bezeichnung" value={label} onChange={setLabel} placeholder="z. B. Jahresabrechnung" />
        <div className="flex flex-col gap-2 pt-1">
          <PrimaryButton disabled={!valid}>{oneOff ? 'Speichern' : 'Hinzufügen'}</PrimaryButton>
          {oneOff && onDelete && (
            <SecondaryButton danger onClick={() => onDelete(oneOff)}>
              Einmalbetrag löschen
            </SecondaryButton>
          )}
        </div>
      </form>
    </BottomSheet>
  );
}
