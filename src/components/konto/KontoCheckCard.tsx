import { useState } from 'react';
import { db } from '../../db/db';
import { answerMonthCheck, confirmBalance, session, setAnchor } from '../../db/kontoActions';
import { useKonto } from '../../db/useKonto';
import { localToday } from '../../lib/activeMonth';
import { formatEUR, parseAmount } from '../../lib/format';
import { dueCard } from '../../lib/kontoBalance';
import { periodName } from '../../lib/kontoWords';
import { useMonthStart } from '../../lib/useToday';
import { t } from '../../lib/kontoTexts';
import type { Dataset, Period } from '../../lib/types';
import { AmountField } from '../form';
import { Pea } from '../Pea';
import { useKontoState } from './KontoSheet';

const BUTTON = 'focus-ring h-11 flex-1 rounded-xl px-4 text-[15px] font-semibold md:flex-none';
const PRIMARY = `${BUTTON} bg-accent text-white hover:bg-accent-hover disabled:opacity-50`;
const SECONDARY = `${BUTTON} text-ink-soft hover:bg-zinc-100`;

/**
 * Monats-Check, on top of the month screen: at most one card.
 * - „Neuer Monat. Hast du € X zur Seite gelegt?“ (X: the month's amount, base plus extra) – Ja / Noch
 *   nicht (asks again on a later day). The only recurring action; it counts the series.
 * - every 3 months „Stimmt dein Kontostand noch? € Z“ Stimmt / Anderer Betrag (new anchor)
 * - after „Weiß ich gerade nicht“: the balance, on the next start
 */
export function KontoCheckCard({ ds, active }: { ds: Dataset; active: Period }) {
  const { settings } = useKonto();
  const [hidden, setHidden] = useState(false);
  const card = hidden ? null : dueCard(settings, active, localToday(), { setUpThisSession: session.setUp });
  if (!card) return null;
  return <Card card={card} ds={ds} active={active} onLater={() => setHidden(true)} again={settings.checks.some((c) => c.period === active)} />;
}

function Card({ card, ds, active, again, onLater }: { card: 'month' | 'balance' | 'remind'; ds: Dataset; active: Period; again: boolean; onLater: () => void }) {
  const state = useKontoState(ds, active);
  const [editing, setEditing] = useState(card === 'remind');
  const [text, setText] = useState('');
  const amount = parseAmount(text);
  const start = useMonthStart();
  const betrag = formatEUR(state.months[0]!.amount);
  const title =
    card === 'month'
      ? again
        ? t('check.month.again', { monat: periodName(active, start), betrag })
        : t('check.month', { betrag })
      : card === 'balance'
        ? t('check.balance', { betrag: formatEUR(state.balance) })
        : t('check.balance.remind');
  return (
    <section className="glass surface flex flex-col gap-3 p-4 md:p-5" aria-labelledby="konto-check-title" data-testid="konto-check" data-card={card}>
      <div className="flex items-start gap-3">
        <Pea size={28} className="mt-0.5 shrink-0" />
        <p id="konto-check-title" className="min-w-0 text-[15px] font-semibold leading-snug text-ink" data-testid="konto-check-title">
          {title}
        </p>
      </div>
      {card === 'month' && (
        <div className="flex gap-2">
          <button type="button" className={PRIMARY} onClick={() => void answerMonthCheck(db, active, true, localToday(), state.months[0]!.amount)} data-testid="konto-check-yes">
            {t('check.month.yes')}
          </button>
          <button type="button" className={SECONDARY} onClick={() => void answerMonthCheck(db, active, false, localToday())} data-testid="konto-check-no">
            {t('check.month.no')}
          </button>
        </div>
      )}
      {card !== 'month' && !editing && (
        <div className="flex gap-2">
          <button type="button" className={PRIMARY} onClick={() => void confirmBalance(db, localToday())} data-testid="konto-check-ok">
            {t('check.balance.ok')}
          </button>
          <button type="button" className={SECONDARY} onClick={() => setEditing(true)} data-testid="konto-check-other">
            {t('check.balance.other')}
          </button>
        </div>
      )}
      {card !== 'month' && editing && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (amount !== null) void setAnchor(db, amount, localToday());
          }}
        >
          <AmountField label={t('settings.balance')} value={text} onChange={setText} placeholder="z. B. 1.200" testId="konto-check-amount" />
          <div className="flex gap-2">
            <button type="submit" className={PRIMARY} disabled={amount === null} data-testid="konto-check-save">
              {t('check.balance.save')}
            </button>
            <button type="button" className={SECONDARY} onClick={card === 'remind' ? onLater : () => setEditing(false)} data-testid="konto-check-later">
              {t('check.later')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
