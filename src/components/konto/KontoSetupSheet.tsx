import { useEffect, useState, type ReactNode } from 'react';
import type { SetupAnswers } from '../../db/kontoActions';
import type { GapMode } from '../../db/settings';
import type { MonthStart } from '../../lib/activeMonth';
import { amountToInput, formatEUR, parseAmount } from '../../lib/format';
import { orderDay, type KontoState } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { reasonText } from '../../lib/kontoWords';
import { BottomSheet } from '../BottomSheet';
import { AmountField } from '../form';
import { Pea, PeaOpen } from '../Pea';
import { CopyButton, PlanAmount } from './KontoStatusView';

export type Step = 'account' | 'balance' | 'order' | 'gap' | 'plan';

interface Props {
  /** the stored state (kontoState): the gap question and „Dein Plan“ show exactly these numbers */
  state: KontoState;
  start: MonthStart;
  /** the questions answered: save them (the gap question and the plan then read the saved state) */
  onAnswers: (answers: SetupAnswers) => Promise<void>;
  /** „Auf {n} Monate verteilen“ / „Auf einmal zur Seite legen“ */
  onGapMode: (mode: GapMode) => Promise<void>;
  onClose: () => void;
  /** „Fertig“ */
  onFinish: () => void;
  initialStep?: Step;
  /** answers so far („Einrichtung ändern“) */
  initial?: Partial<SetupAnswers>;
}

const BIG = 'focus-ring flex min-h-14 w-full items-center justify-center rounded-2xl px-5 py-3 text-center text-[17px] font-semibold leading-snug';
const PRIMARY = `${BIG} bg-accent text-white hover:bg-accent-hover disabled:opacity-50`;
const SECONDARY = `${BIG} glass-inset bg-surface text-ink hover:bg-zinc-100`;

/**
 * Setup of „Fixkosten einplanen“, one question per screen:
 * 1 „Hast du ein eigenes Konto für Fixkosten?“ – Ja / Nein, ich plane nur
 * 2 „Wie viel hast du heute schon für Fixkosten zur Seite gelegt?“ – amount (with cents), or „Noch nichts“
 * 3 only with an account: „Läuft dein Dauerauftrag schon?“ – Ja / Nein
 * then saved; only with a gap one more, last question: „Im Februar kommen … Dafür fehlen dir € Y. Wie
 * willst du das lösen?“ – „Auf {n} Monate verteilen (€ Z extra pro Monat)“ / „Auf einmal zur Seite legen“.
 * At the end „Dein Plan“: the one amount with its reason, from the stored state.
 */
export function KontoSetupSheet({ state, start, onAnswers, onGapMode, onClose, onFinish, initialStep = 'account', initial }: Props) {
  const [step, setStep] = useState<Step>(initialStep);
  const [hasAccount, setHasAccount] = useState(initial?.hasAccount ?? true);
  const [orderRuns, setOrderRuns] = useState<boolean | null>(initial?.orderRuns ?? null);
  const [balanceText, setBalanceText] = useState(initial?.balance ? amountToInput(initial.balance) : '');
  const balance = parseAmount(balanceText);
  const balanceError = balanceText.trim() !== '' && balance === null ? 'Bitte einen Betrag eingeben, z. B. 1.087,43' : null;
  // the gap question is one more step, only when there is a gap that can be spread
  const total = (hasAccount ? 3 : 2) + (step === 'gap' ? 1 : 0);
  // the answers just saved: the next screen shows once the stored state has them, never the state from before
  const [saved, setSaved] = useState<SetupAnswers | null>(null);
  const arrived =
    !!saved && state.setupDone && state.hasAccount === saved.hasAccount && Math.round(state.balance * 100) === Math.round(saved.balance * 100);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!waiting || !arrived) return;
    setWaiting(false);
    setStep(state.canSpread ? 'gap' : 'plan');
  }, [waiting, arrived, state.canSpread]);

  async function save(amount: number, runs: boolean | null) {
    const answers = { hasAccount, balance: amount, orderRuns: runs };
    setOrderRuns(runs);
    setSaved(answers);
    setWaiting(true);
    await onAnswers(answers);
  }
  // after the amount: with an account the standing order question, without it saved
  const afterBalance = (amount: number) => (hasAccount ? setStep('order') : void save(amount, null));
  const n = step === 'account' ? 1 : step === 'balance' ? 2 : step === 'order' ? 3 : total;

  return (
    <BottomSheet title={step === 'plan' ? t('setup.plan') : t('setup.title')} onClose={onClose}>
      <div data-testid="konto-setup" data-step={waiting ? 'saving' : step}>
        {step !== 'plan' && !waiting && <Progress n={n} total={total} />}

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

        {!waiting && step === 'gap' && (
          <Question title={reasonText(state, start)}>
            <p className="-mt-2 mb-2 text-[17px] leading-snug text-ink-soft" data-testid="konto-setup-gap-text">
              {t('setup.gap.text', { betrag: formatEUR(state.gap) })}
            </p>
            <button
              type="button"
              className={SECONDARY}
              onClick={() => void onGapMode('spread').then(() => setStep('plan'))}
              data-testid="konto-setup-gap-spread"
            >
              {state.deposits === 1
                ? t('setup.gap.spread.one', { betrag: formatEUR(spreadExtra(state)) })
                : t('setup.gap.spread', { n: state.deposits, betrag: formatEUR(spreadExtra(state)) })}
            </button>
            <button type="button" className={SECONDARY} onClick={() => void onGapMode('lump').then(() => setStep('plan'))} data-testid="konto-setup-gap-lump">
              {t('setup.gap.lump')}
            </button>
          </Question>
        )}

        {!waiting && step === 'plan' && (
          <div className="flex flex-col gap-5" data-testid="konto-setup-plan" data-mode={state.mode ?? 'covered'}>
            <PlanAmount state={state} start={start} size="large" testId="setup" />
            {state.hasAccount && orderRuns === false && (
              <div data-testid="konto-setup-order-hint">
                <p className="text-[15px] leading-snug text-ink">{t('setup.order.new', { betrag: formatEUR(state.next.amount), tag: orderDay(start) })}</p>
                <CopyButton amount={state.next.amount} testId="konto-setup-copy" />
              </div>
            )}
            <button type="button" className={PRIMARY} onClick={onFinish} data-testid="konto-setup-finish">
              {t('setup.finish')}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/** The extra per deposit when spread (also while lump is chosen: the option shows what spreading would mean). */
function spreadExtra(state: KontoState): number {
  return state.deposits > 0 ? Math.ceil(Math.round(state.gap * 100) / state.deposits - 1e-9) / 100 : 0;
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
