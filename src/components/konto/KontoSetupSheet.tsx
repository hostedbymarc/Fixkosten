import { useEffect, useState, type ReactNode } from 'react';
import type { SetupAnswers } from '../../db/kontoActions';
import type { MonthStart } from '../../lib/activeMonth';
import { amountToInput, parseAmount } from '../../lib/format';
import type { KontoState } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { BottomSheet } from '../BottomSheet';
import { AmountField } from '../form';
import { Pea, PeaOpen } from '../Pea';

export type Step = 'account' | 'balance' | 'order';

interface Props {
  /** the stored state (kontoState): the setup closes once it has the answers */
  state: KontoState;
  start: MonthStart;
  /** the questions answered: save them */
  onAnswers: (answers: SetupAnswers) => Promise<void>;
  onClose: () => void;
  /** saved: the setup closes, „Dein Plan“ opens */
  onFinish: () => void;
  initialStep?: Step;
  /** answers so far („Einrichtung ändern“) */
  initial?: Partial<SetupAnswers>;
}

const BIG = 'focus-ring flex min-h-14 w-full items-center justify-center rounded-2xl px-5 py-3 text-center text-[17px] font-semibold leading-snug';
const PRIMARY = `${BIG} bg-accent text-white hover:bg-accent-hover disabled:opacity-50`;
const SECONDARY = `${BIG} border border-control-edge bg-control text-ink hover:bg-control-track`;

/**
 * Setup of „Fixkosten einplanen“, one question per screen:
 * 1 „Hast du ein eigenes Konto für Fixkosten?“ – Ja / Nein, ich plane nur
 * 2 „Wie viel hast du heute schon für Fixkosten zur Seite gelegt?“ – amount (with cents), or „Noch nichts“
 * 3 only with an account: „Läuft dein Dauerauftrag schon?“ – Ja / Nein
 * then saved and closed; „Dein Plan“ opens with the recommended plan (monat-verdichtet: the questions
 * about the gap, „verteilt / auf einmal“, are gone).
 */
export function KontoSetupSheet({ state, onAnswers, onClose, onFinish, initialStep = 'account', initial }: Props) {
  const [step, setStep] = useState<Step>(initialStep);
  const [hasAccount, setHasAccount] = useState(initial?.hasAccount ?? true);
  const [balanceText, setBalanceText] = useState(initial?.balance ? amountToInput(initial.balance) : '');
  const balance = parseAmount(balanceText);
  const balanceError = balanceText.trim() !== '' && balance === null ? 'Bitte einen Betrag eingeben, z. B. 1.087,43' : null;
  const total = hasAccount ? 3 : 2;
  // the answers just saved: the next screen shows once the stored state has them, never the state from before
  const [saved, setSaved] = useState<SetupAnswers | null>(null);
  const arrived =
    !!saved && state.setupDone && state.hasAccount === saved.hasAccount && Math.round(state.balance * 100) === Math.round(saved.balance * 100);
  const [waiting, setWaiting] = useState(false);
  // monat-verdichtet: no gap question any more – saved, the setup closes and „Dein Plan“ opens with the recommendation
  useEffect(() => {
    if (!waiting || !arrived) return;
    setWaiting(false);
    onFinish();
  }, [waiting, arrived, onFinish]);

  async function save(amount: number, runs: boolean | null) {
    const answers = { hasAccount, balance: amount, orderRuns: runs };
    setSaved(answers);
    setWaiting(true);
    await onAnswers(answers);
  }
  // after the amount: with an account the standing order question, without it saved
  const afterBalance = (amount: number) => (hasAccount ? setStep('order') : void save(amount, null));
  const n = step === 'account' ? 1 : step === 'balance' ? 2 : 3;

  return (
    <BottomSheet title={t('setup.title')} onClose={onClose}>
      <div data-testid="konto-setup" data-step={waiting ? 'saving' : step}>
        {!waiting && <Progress n={n} total={total} />}

        {waiting && <div className="min-h-[240px]" aria-busy="true" data-testid="konto-setup-saving" />}

        {!waiting && step === 'account' && (
          <Question title={t('setup.account')}>
            <button type="button" className={SECONDARY} onClick={() => (setHasAccount(true), setStep('balance'))} data-testid="konto-setup-account-yes">
              {t('setup.account.yes')}
            </button>
            <button type="button" className={SECONDARY} onClick={() => (setHasAccount(false), setStep('balance'))} data-testid="konto-setup-account-no">
              {t('setup.account.no')}
            </button>
          </Question>
        )}

        {!waiting && step === 'balance' && (
          <Question title={t('setup.balance')}>
            <AmountField
              label={t('setup.balance.label')}
              value={balanceText}
              onChange={setBalanceText}
              placeholder="z. B. 1.087,43"
              error={balanceError}
              testId="konto-setup-balance"
            />
            <button
              type="button"
              className={PRIMARY}
              disabled={balanceText.trim() === '' || balance === null}
              onClick={() => afterBalance(balance ?? 0)}
              data-testid="konto-setup-next"
            >
              {t('setup.next')}
            </button>
            <button type="button" className={SECONDARY} onClick={() => (setBalanceText(''), afterBalance(0))} data-testid="konto-setup-nothing">
              {t('setup.balance.none')}
            </button>
            <BackButton onClick={() => setStep('account')} />
          </Question>
        )}

        {!waiting && step === 'order' && (
          <Question title={t('setup.order')}>
            <button type="button" className={SECONDARY} onClick={() => void save(balance ?? 0, true)} data-testid="konto-setup-order-yes">
              {t('setup.order.yes')}
            </button>
            <button type="button" className={SECONDARY} onClick={() => void save(balance ?? 0, false)} data-testid="konto-setup-order-no">
              {t('setup.order.no')}
            </button>
            <BackButton onClick={() => setStep('balance')} />
          </Question>
        )}

      </div>
    </BottomSheet>
  );
}

function Progress({ n, total }: { n: number; total: number }) {
  return (
    <div className="mb-5 flex items-center gap-3" data-testid="konto-setup-progress">
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (i < n ? <Pea key={i} size={14} /> : <PeaOpen key={i} size={14} />))}
      </span>
      <span className="text-[13px] font-medium text-ink-mute">{t('setup.progress', { n, gesamt: total })}</span>
    </div>
  );
}

function Question({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="mb-2 text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ink" data-testid="konto-setup-question">
        {title}
      </h3>
      {children}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring mx-auto h-11 rounded-lg px-3 text-[15px] font-medium text-ink-mute hover:text-ink"
      data-testid="konto-setup-back"
    >
      {t('setup.back')}
    </button>
  );
}
