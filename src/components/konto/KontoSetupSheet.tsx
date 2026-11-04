import { useState, type ReactNode } from 'react';
import { amountToInput, formatEUR, parseAmount } from '../../lib/format';
import { type Pod } from '../../lib/schote';
import { t } from '../../lib/schoteTexts';
import { BottomSheet } from '../BottomSheet';
import { AmountField } from '../form';
import { Pea, PeaOpen } from '../Pea';
import { PeaPod, PodAnswer } from './PeaPod';

/** Answer to „Ist der Dauerauftrag für November schon eingegangen?“ */
export type OrderAnswer = 'yes' | 'no' | 'none';

export interface SetupResult {
  hasAccount: boolean;
  /** „Kontostand heute“ (0 without an account or with „Weiß ich gerade nicht“) */
  balance: number;
  /** „Weiß ich gerade nicht“: ask again on the next start */
  balanceUnknown: boolean;
  order: OrderAnswer;
  /** plan checklist („Fixkostenkonto eröffnen“ only without an account) */
  accountDone: boolean;
  orderDone: boolean;
  gapDone: boolean;
}

export interface Coverage {
  pod: Pod;
  gap: number;
}

interface Props {
  /** „November“ – the active month */
  monthName: string;
  /** the rounded standing order */
  order: number;
  /** „am 1.“ – from „Neuer Monat beginnt am“ */
  day: string;
  /**
   * Coverage for a balance. `deposits`: the standing order runs (in „Dein Plan“: once its point is
   * done). `firstDeposit`: this month's standing order still arrives (answer „Nein“); „Ja“ (already on
   * the balance) and „Ich habe noch keinen“ (none this month) don't.
   */
  coverage: (balance: number, opts: { firstDeposit: boolean; deposits: boolean }) => Coverage;
  /** after every answered question: steps done (1–3) and the answers so far */
  onProgress?: (steps: number, answers: SetupResult) => void;
  onClose: () => void;
  onFinish: (result: SetupResult) => void;
  /** start on a given step (dev page / screenshots) */
  initialStep?: Step;
  initialResult?: Partial<SetupResult>;
}

export type Step = 'account' | 'balance' | 'order' | 'plan';
const STEP_NO: Record<Exclude<Step, 'plan'>, number> = {
  account: 1,
  balance: 2,
  order: 3,
};

const BIG = 'focus-ring flex h-14 w-full items-center justify-center rounded-2xl px-5 text-[17px] font-semibold';
const PRIMARY = `${BIG} bg-accent text-white hover:bg-accent-hover disabled:opacity-50`;
const SECONDARY = `${BIG} glass-inset bg-surface text-ink hover:bg-zinc-100`;

/**
 * Setup of the Fixkostenkonto: one question per screen, big buttons, progress on top, then
 * „Dein Plan“ as a checklist with peas instead of ticks. Every point done snaps in the peas it covers
 * right away; with everything done: „Alles gedeckt bis …“, „Fertig“ goes back to the month screen.
 */
export function KontoSetupSheet({ monthName, order, day, coverage, onClose, onFinish, onProgress, initialStep = 'account', initialResult }: Props) {
  const [step, setStep] = useState<Step>(initialStep);
  const [noAccount, setNoAccount] = useState(initialResult?.hasAccount === false && initialStep === 'account');
  const [r, setR] = useState<SetupResult>({
    hasAccount: true,
    balance: 0,
    balanceUnknown: false,
    order: 'no',
    accountDone: false,
    orderDone: false,
    gapDone: false,
    ...initialResult,
  });
  const [balanceText, setBalanceText] = useState(initialResult?.balance ? amountToInput(initialResult.balance) : '');
  const balance = parseAmount(balanceText);
  const balanceError = balanceText.trim() !== '' && balance === null ? 'Bitte einen Betrag eingeben' : null;
  const set = (patch: Partial<SetupResult>) => setR((cur) => ({ ...cur, ...patch }));
  /** a question is answered: store the answers, report the progress, go on */
  const answer = (steps: number, patch: Partial<SetupResult>, next: Step) => {
    const answers = { ...r, ...patch };
    setR(answers);
    onProgress?.(steps, answers);
    setStep(next);
  };

  return (
    <BottomSheet title={step === 'plan' ? t('plan.title') : t('setup.title')} onClose={onClose}>
      <div data-testid="konto-setup" data-step={step}>
        {step !== 'plan' && <Progress n={STEP_NO[step]} />}

        {step === 'account' && (
          <Question title={t('setup.q1')}>
            {noAccount ? (
              <>
                <p className="flex items-start gap-3 text-[16px] leading-snug text-ink" data-testid="konto-setup-no-account">
                  <Pea size={24} className="mt-0.5 shrink-0" />
                  {t('setup.q1.noText')}
                </p>
                {/* without an account the balance is 0 and there is no standing order yet */}
                <button type="button" className={PRIMARY} onClick={() => answer(3, {}, 'plan')} data-testid="konto-setup-next">
                  {t('setup.next')}
                </button>
              </>
            ) : (
              <>
                <button type="button" className={PRIMARY} onClick={() => answer(1, { hasAccount: true }, 'balance')} data-testid="konto-setup-has-account">
                  {t('setup.q1.yes')}
                </button>
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => (
                    set({
                      hasAccount: false,
                      balance: 0,
                      balanceUnknown: false,
                      order: 'none',
                    }),
                    setNoAccount(true)
                  )}
                  data-testid="konto-setup-no-account-button"
                >
                  {t('setup.q1.no')}
                </button>
              </>
            )}
          </Question>
        )}

        {step === 'balance' && (
          <Question title={t('setup.q2')}>
            <AmountField
              label={t('setup.q2.label')}
              value={balanceText}
              onChange={setBalanceText}
              placeholder="z. B. 1.200"
              error={balanceError}
              testId="konto-setup-balance"
            />
            <p className="-mt-1 text-[14px] leading-snug text-ink-soft" data-testid="konto-setup-balance-hint">
              {t('setup.q2.hint')}
            </p>
            <button
              type="button"
              className={PRIMARY}
              disabled={balanceText.trim() === '' || balance === null}
              onClick={() => answer(2, { balance: balance ?? 0, balanceUnknown: false }, 'order')}
              data-testid="konto-setup-next"
            >
              {t('setup.next')}
            </button>
            <button
              type="button"
              className="focus-ring mx-auto h-11 rounded-lg px-3 text-[15px] font-semibold text-accent-ink underline-offset-4 hover:underline"
              onClick={() => (setBalanceText(''), answer(2, { balance: 0, balanceUnknown: true }, 'order'))}
              data-testid="konto-setup-balance-unknown"
            >
              {t('setup.q2.unknown')}
            </button>
            <BackButton onClick={() => setStep('account')} />
          </Question>
        )}

        {step === 'order' && (
          <Question title={t('setup.q3', { monat: monthName })}>
            {(
              [
                ['yes', t('setup.q3.yes')],
                ['no', t('setup.q3.no')],
                ['none', t('setup.q3.none')],
              ] as const
            ).map(([choice, text]) => (
              <button
                key={choice}
                type="button"
                className={SECONDARY}
                onClick={() => answer(3, { order: choice }, 'plan')}
                data-testid={`konto-setup-order-${choice}`}
              >
                {text}
              </button>
            ))}
            <BackButton onClick={() => setStep('balance')} />
          </Question>
        )}

        {step === 'plan' && <Plan r={r} set={set} order={order} day={day} coverage={coverage} onFinish={() => onFinish(r)} />}
      </div>
    </BottomSheet>
  );
}

function Plan({
  r,
  set,
  order,
  day,
  coverage,
  onFinish,
}: {
  r: SetupResult;
  set: (patch: Partial<SetupResult>) => void;
  order: number;
  day: string;
  coverage: Props['coverage'];
  onFinish: () => void;
}) {
  const firstDeposit = r.order === 'no';
  // the gap is fixed by the answers (with the standing order running); „Erledigt“ puts it on the balance
  const full = coverage(r.balance, { firstDeposit, deposits: true });
  const gap = Math.round(full.gap * 100) > 0 ? full.gap : 0;
  // the reward comes per step: every point done covers what it covers, and those peas snap in at once
  const now = coverage(r.balance + (r.gapDone ? gap : 0), { firstDeposit, deposits: r.orderDone });
  const allDone = (r.hasAccount || r.accountDone) && r.orderDone && (gap === 0 || r.gapDone);
  const anyDone = r.accountDone || r.orderDone || r.gapDone;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(amountToInput(order));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no clipboard: the amount stays visible */
    }
  }

  // answer first: the sentence, then the action. While other points are open the action is the list
  // below; once the one-time transfer is the only point left, it comes right under the sentence.
  const gapLast = gap > 0 && !r.gapDone && r.orderDone && (r.hasAccount || r.accountDone);
  const gapAction = gapLast ? (
    <div className="mt-1" data-testid="plan-gap">
      <p className="pod-answer-action">
        Zahl einmalig <span className="num whitespace-nowrap font-semibold text-ink">{formatEUR(gap)}</span> ein, dann passt alles.
      </p>
      <button
        type="button"
        onClick={() => set({ gapDone: true })}
        className="focus-ring mt-2 h-11 w-full rounded-xl bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-hover sm:w-auto"
        data-testid="plan-gap-done"
      >
        {t('tile.gap.action')}
      </button>
    </div>
  ) : (
    <></>
  );
  return (
    <div className="flex flex-col gap-5" data-testid="konto-setup-plan" data-done={allDone || undefined}>
      <div>
        <PodAnswer pod={now.pod} gap={gap} action={gapAction} testId="plan-answer" />
        <PeaPod pod={now.pod} size="large" testId="plan-pod" />
        {!anyDone && (
          <p className="mt-2 text-[14px] leading-snug text-ink-soft" data-testid="plan-pending">
            {t('plan.pending')}
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-3">
        {!r.hasAccount && (
          <PlanItem done={r.accountDone} onDone={() => set({ accountDone: !r.accountDone })} testId="plan-account">
            <span className="font-semibold">{t('plan.account')}</span>
            <span className="mt-0.5 block text-[14px] text-ink-soft">{t('plan.account.hint')}</span>
          </PlanItem>
        )}
        <PlanItem done={r.orderDone} onDone={() => set({ orderDone: !r.orderDone })} testId="plan-order">
          {r.order === 'none' ? 'Dauerauftrag einrichten: ' : 'Dauerauftrag prüfen: '}
          <span className="num whitespace-nowrap font-semibold">{formatEUR(order)}</span> monatlich {day}
          <button
            type="button"
            onClick={copy}
            className="focus-ring mt-2 flex h-11 items-center rounded-xl px-3 text-[15px] font-semibold text-accent-ink glass-inset bg-surface"
            data-testid="plan-copy"
          >
            {copied ? t('plan.copied') : t('plan.copy')}
          </button>
        </PlanItem>
        {gap > 0 && !gapLast && (
          <PlanItem done={r.gapDone} onDone={() => set({ gapDone: !r.gapDone })} testId="plan-gap-item">
            Einmalig <span className="num whitespace-nowrap font-semibold">{formatEUR(gap)}</span> überweisen
          </PlanItem>
        )}
      </ul>
      {allDone && (
        <button type="button" className={PRIMARY} onClick={onFinish} data-testid="konto-setup-finish">
          {t('plan.finish')}
        </button>
      )}
    </div>
  );
}

function PlanItem({ done, onDone, children, testId }: { done: boolean; onDone: () => void; children: ReactNode; testId: string }) {
  return (
    <li className="glass-inset flex items-start gap-3 rounded-2xl bg-surface p-4" data-testid={testId} data-done={done || undefined}>
      <span className="mt-0.5 shrink-0">{done ? <Pea size={24} state="checked" className="anim-check" /> : <PeaOpen size={24} />}</span>
      <div className="min-w-0 flex-1 text-[16px] leading-snug text-ink">{children}</div>
      <button
        type="button"
        onClick={onDone}
        aria-pressed={done}
        className={`focus-ring h-11 shrink-0 rounded-xl px-4 text-[15px] font-semibold ${done ? 'text-paid-ink' : 'bg-accent text-white hover:bg-accent-hover'}`}
        data-testid={`${testId}-done`}
      >
        {t('plan.done')}
      </button>
    </li>
  );
}

function Progress({ n }: { n: number }) {
  return (
    <div className="mb-5 flex items-center gap-3" data-testid="konto-setup-progress">
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((i) => (i <= n ? <Pea key={i} size={14} /> : <PeaOpen key={i} size={14} />))}
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
