import { useState, type ReactNode } from 'react';
import type { SetupAnswers } from '../../db/kontoActions';
import { amountToInput, parseAmount } from '../../lib/format';
import type { KontoState } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { BottomSheet } from '../BottomSheet';
import { AmountField } from '../form';
import { Pea, PeaOpen } from '../Pea';
import { KontoStatusLine, PlanList, PlanSuccess } from './KontoStatusView';

export type Step = 'balance' | 'order' | 'plan';

interface Props {
  /** the stored state (kontoState): „Dein Plan“ shows exactly these numbers */
  state: KontoState;
  /** „am 1.“ – from „Neuer Monat beginnt am“ */
  day: string;
  /** both questions answered: save them (the plan then reads the saved state) */
  onAnswers: (answers: SetupAnswers) => Promise<void>;
  onClose: () => void;
  /** „Fertig“ under the success moment */
  onFinish: () => void;
  initialStep?: Step;
  /** answers so far („Einrichtung ändern“) */
  initial?: Partial<SetupAnswers>;
}

const BIG = 'focus-ring flex h-14 w-full items-center justify-center rounded-2xl px-5 text-[17px] font-semibold';
const PRIMARY = `${BIG} bg-accent text-white hover:bg-accent-hover disabled:opacity-50`;
const SECONDARY = `${BIG} glass-inset bg-surface text-ink hover:bg-zinc-100`;

/**
 * Setup of the Fixkostenkonto in two questions, then „Dein Plan“ as a checklist:
 * 1 „Wie viel liegt heute auf deinem Fixkostenkonto?“ – amount, or „Ich habe noch keins“ (0, and
 *   „Fixkostenkonto eröffnen“ comes into the plan)
 * 2 „Läuft dein Dauerauftrag schon?“ – Ja / Nein
 * The answers are saved right after question 2; the plan, its progress and the status come from the
 * stored state, so they are the same as on the tile, in the sheet and in the settings.
 */
export function KontoSetupSheet({ state, day, onAnswers, onClose, onFinish, initialStep = 'balance', initial }: Props) {
  const [step, setStep] = useState<Step>(initialStep);
  const [hasAccount, setHasAccount] = useState(initial?.hasAccount ?? true);
  const [balanceText, setBalanceText] = useState(initial?.balance ? amountToInput(initial.balance) : '');
  const balance = parseAmount(balanceText);
  const balanceError = balanceText.trim() !== '' && balance === null ? 'Bitte einen Betrag eingeben' : null;

  async function answerOrder(orderRuns: boolean) {
    await onAnswers({ balance: hasAccount ? (balance ?? 0) : 0, hasAccount, orderRuns });
    setStep('plan');
  }

  return (
    <BottomSheet title={step === 'plan' ? t('plan.title') : t('setup.title')} onClose={onClose}>
      <div data-testid="konto-setup" data-step={step}>
        {step !== 'plan' && <Progress n={step === 'balance' ? 1 : 2} />}

        {step === 'balance' && (
          <Question title={t('setup.q1')}>
            <AmountField
              label={t('setup.q1.label')}
              value={balanceText}
              onChange={setBalanceText}
              placeholder="z. B. 1.200"
              error={balanceError}
              testId="konto-setup-balance"
            />
            <button
              type="button"
              className={PRIMARY}
              disabled={balanceText.trim() === '' || balance === null}
              onClick={() => (setHasAccount(true), setStep('order'))}
              data-testid="konto-setup-next"
            >
              {t('setup.next')}
            </button>
            <button
              type="button"
              className={SECONDARY}
              onClick={() => (setHasAccount(false), setBalanceText(''), setStep('order'))}
              data-testid="konto-setup-no-account"
            >
              {t('setup.q1.none')}
            </button>
          </Question>
        )}

        {step === 'order' && (
          <Question title={t('setup.q2')}>
            <button type="button" className={SECONDARY} onClick={() => void answerOrder(true)} data-testid="konto-setup-order-yes">
              {t('setup.q2.yes')}
            </button>
            <button type="button" className={SECONDARY} onClick={() => void answerOrder(false)} data-testid="konto-setup-order-no">
              {t('setup.q2.no')}
            </button>
            <BackButton onClick={() => setStep('balance')} />
          </Question>
        )}

        {step === 'plan' && (
          <div className="flex flex-col gap-5" data-testid="konto-setup-plan" data-done={state.status === 'covered' || undefined}>
            {state.status === 'covered' ? (
              <PlanSuccess state={state} />
            ) : (
              <KontoStatusLine state={state} withAction={false} testId="plan-status" />
            )}
            <PlanList state={state} day={day} />
            {state.status === 'covered' && (
              <button type="button" className={PRIMARY} onClick={onFinish} data-testid="konto-setup-finish">
                {t('plan.finish')}
              </button>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function Progress({ n }: { n: number }) {
  return (
    <div className="mb-5 flex items-center gap-3" data-testid="konto-setup-progress">
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {[1, 2].map((i) => (i <= n ? <Pea key={i} size={14} /> : <PeaOpen key={i} size={14} />))}
      </span>
      <span className="text-[13px] font-medium text-ink-mute">{t('setup.progress', { n })}</span>
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
