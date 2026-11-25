// polster-ziel (Design-Canvas „Erbse – Polster-Ziel Mockups“, Screens 1–5): the Polster and its goal. Every number
// comes from src/lib/polster.ts (cents), which reads the month cards (monthCard) and the plan (monthPlan). The
// Polster changes only when the user confirms („Polster aufgefüllt“ / „Aus Polster genommen“) or enters it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../db/db';
import { confirmCushion, setCushionBalance, setCushionGoal, setCushionRule, undoCushion } from '../../db/kontoActions';
import type { KontoSettings } from '../../db/settings';
import { useKonto } from '../../db/useKonto';
import { amountToInput, currencySymbol, formatEUR, parseAmount } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import { monthCard, planRows, type PlanRow } from '../../lib/monthCard';
import type { MonthPlan } from '../../lib/monthPlan';
import { monthName } from '../../lib/period';
import {
  cushionActive,
  cushionBefore,
  cushionCover,
  cushionOf,
  cushionPercent,
  distribution,
  nextStage,
  projectCushion,
  salaryWithoutCushion,
  stageAmount,
  toCents,
  type Cushion,
  type CushionRow,
} from '../../lib/polster';
import { onOpenPolster, openPolster, type OpenPolster } from '../../lib/polsterBus';
import { closePopover } from '../../lib/popoverBus';
import type { Dataset, Period } from '../../lib/types';
import { useMonthStart } from '../../lib/useToday';
import { BottomSheet } from '../BottomSheet';
import { Confetti } from '../Confetti';
import { AmountInput } from '../form';
import { CheckIcon, ChevronRight } from '../Icons';
import { useToast } from '../Toast';
import { useMonthPlan } from './DeinMonatCard';

/** cents → „€ 14.000“ (cents only when there are any) */
const eur = (cents: number) => formatEUR(cents / 100);
/** months with one decimal („4,1“) */
const dec = (n: number) => n.toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const BUTTON = 'focus-ring inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[15px] font-semibold';
/** the action of the green card (as „Überwiesen“ there) */
const ACTION =
  'focus-ring press inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand-100 px-5 text-center text-[15px] font-semibold leading-snug text-brand-700 shadow-card disabled:opacity-40';
/** „ca. € 3.425“: whole euros */
const eurRound = (cents: number) => formatEUR(Math.round(cents / 100));

/** The plan with the Polster: the rows of „Dein Plan“ (month cards) and the projection from today's Polster on. */
export function useCushionPlan(ds: Dataset, plan: MonthPlan): { c: Cushion; rows: PlanRow[]; proj: CushionRow[] } {
  const { settings } = useKonto();
  const start = useMonthStart();
  const c = useMemo(() => cushionOf(settings), [settings]);
  const rows = useMemo(() => planRows(ds, plan, start), [ds, plan, start]);
  const proj = useMemo(() => projectCushion(rows, c), [rows, c]);
  return { c, rows, proj };
}

/** The bar: the Polster of the goal, marks at 25/50/75 %, the next stage in the warn token. */
export function CushionBar({ balance, goal, height = 12, testId }: { balance: number; goal: number; height?: number; testId?: string }) {
  const pct = cushionPercent(balance, goal) ?? 0;
  const next = nextStage(pct);
  return (
    <div
      className="relative w-full rounded-full bg-control-track"
      style={{ height }}
      role="img"
      aria-label={t('cushion.progress', { prozent: pct, betrag: eur(Math.max(0, goal - balance)) })}
      data-testid={testId}
      data-percent={pct}
      data-next={next ?? undefined}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (balance * 100) / goal)}%` }} />
      {[25, 50, 75].map((m) => (
        <span
          key={m}
          aria-hidden="true"
          className={`absolute w-0.5 rounded-full ${m === next ? 'bg-warn' : 'bg-line'}`}
          style={{ left: `${m}%`, top: -3, bottom: -3 }}
          data-stage={m}
          data-next={m === next || undefined}
        />
      ))}
    </div>
  );
}

/** „{p} % · fehlt € X“ */
function progressText(balance: number, goal: number): string {
  return t('cushion.progress', { prozent: cushionPercent(balance, goal) ?? 0, betrag: eur(Math.max(0, goal - balance)) });
}

/**
 * Screen 5: the Polster card of the active month, right under the green card. Stand, „von € Ziel“, the bar with
 * the next stage, „{p} % · fehlt € X“, „{n} Monate Fixkosten“; without a goal „Leg dein Polster-Ziel fest ›“.
 * A tap opens „Dein Polster“.
 */
export function PolsterCard({ plan }: { plan: MonthPlan }) {
  const { settings } = useKonto();
  const button = useRef<HTMLButtonElement>(null);
  const balance = settings.cushionBalance ?? 0;
  const goal = settings.cushionGoal;
  const cover = useMemo(() => cushionCover(plan, balance, goal), [plan, balance, goal]);
  return (
    <button
      ref={button}
      type="button"
      onClick={() => openPolster({ returnFocusTo: button.current })}
      className="glass glass-tile surface press focus-ring flex w-full min-w-0 flex-col gap-2.5 p-4 text-left md:p-5"
      data-testid="polster-card"
      data-goal={goal ?? undefined}
      data-balance={settings.cushionBalance ?? undefined}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-mute">{t('cushion.card')}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden="true" />
      </span>
      {goal === null ? (
        <span className="text-[17px] font-semibold text-accent-ink" data-testid="polster-card-set-goal">
          {t('cushion.setGoal')}
        </span>
      ) : (
        <>
          <span className="num flex w-full items-baseline justify-between gap-3">
            <span className="text-[26px] font-bold tracking-[-0.02em] text-ink" data-testid="polster-card-balance">
              {eur(balance)}
            </span>
            <span className="text-[14px] text-ink-mute" data-testid="polster-card-goal">
              {t('cushion.of', { betrag: eur(goal) })}
            </span>
          </span>
          <CushionBar balance={balance} goal={goal} testId="polster-card-bar" />
          <span className="num flex w-full flex-wrap justify-between gap-x-3 text-[13px]">
            <span className="font-semibold text-accent-ink" data-testid="polster-card-progress">
              {progressText(balance, goal)}
            </span>
            {cover.months !== null && (
              <span className="text-ink-mute" data-testid="polster-card-months">
                {t('cushion.monthsN', { n: dec(cover.months) })}
              </span>
            )}
          </span>
        </>
      )}
    </button>
  );
}

/**
 * Screens 2 and 3, in the green card under the Überschuss: „So verteilst du den Überschuss“ (Überschuss > 0, goal not
 * reached), „Dein Polster deckt die Lücke“ (Überschuss < 0, Polster > 0), „Polster voll · …“ (goal reached). With a
 * button in the active month and in past months not confirmed yet; a muted preview without a button in later months.
 * Confirmed: the amount and „Rückgängig“ (the active month). Crossing a stage: the confetti, once per stage.
 */
export function CushionSplit({ ds, period, active, left }: { ds: Dataset; period: Period; active: Period; left: number }) {
  const { settings } = useKonto();
  const plan = useMonthPlan(ds, active);
  const toast = useToast();
  const { c, proj } = useCushionPlan(ds, plan);
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const [other, setOther] = useState(false);
  const [party, setParty] = useState<{ run: number; goal: boolean } | null>(null);
  const future = period > active;
  const confirmed = c.confirmed[period];
  // „Rückgängig“: the celebration is over (a stage is celebrated only once)
  const undo = () => {
    setParty(null);
    void undoCushion(db, period);
  };
  // a later month: from the Polster planned before it
  const base = future ? cushionBefore(proj, period, c) : c.balance;
  const d = distribution(toCents(left), { ...c, balance: base }, chosen);
  if (!future && confirmed !== undefined) {
    if (period !== active) return null;
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/5 px-3 py-2.5" data-testid="cushion-split" data-kind="confirmed">
        {party && <Confetti key={`cushion-${party.run}`} seed={`cushion-${period}-${party.run}`} falling />}
        <p className="num flex items-center gap-2 text-[14px] font-semibold text-ink" data-testid="cushion-split-confirmed">
          <CheckIcon size={16} strokeWidth={2.6} className="shrink-0 text-paid-ink" aria-hidden="true" />
          {t(confirmed > 0 ? 'cushion.in.done' : 'cushion.out.done', { betrag: eur(Math.abs(confirmed)) })}
        </p>
        {party?.goal && (
          <p className="w-full text-[15px] font-semibold text-ink" data-testid="cushion-split-reached">
            {t('cushion.reached')}
          </p>
        )}
        <button type="button" className={`${BUTTON} -mr-2 text-accent-ink`} onClick={undo} data-testid="cushion-split-undo">
          {t('cushion.undo')}
        </button>
      </div>
    );
  }
  if (!d) return null;
  const canConfirm = !future;
  const confirm = async (amount: number) => {
    const stages = await confirmCushion(db, period, amount);
    if (stages === null) return;
    if (stages.length) setParty((p) => ({ run: (p?.run ?? 0) + 1, goal: stages.includes(100) }));
    toast({
      message: t(amount > 0 ? 'cushion.toast.in' : 'cushion.toast.out', { betrag: eur(Math.abs(amount)) }),
      actionLabel: t('cushion.undo'),
      onAction: undo,
      durationMs: 5000,
    });
  };
  const muted = future ? 'opacity-70' : '';
  if (d.kind === 'full')
    return (
      <p className={`mt-3 rounded-2xl bg-white/5 px-3 py-2.5 text-[14px] font-semibold text-ink ${muted}`} data-testid="cushion-split" data-kind="full" data-preview={future ? '' : undefined}>
        {t('cushion.full')}
      </p>
    );
  const goal = settings.cushionGoal;
  return (
    <div className={`mt-3 flex flex-col gap-2.5 rounded-2xl bg-white/5 p-3.5 ${muted}`} data-testid="cushion-split" data-kind={d.kind} data-preview={future ? '' : undefined}>
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        {d.kind === 'take' && <CheckIcon size={18} strokeWidth={2.4} className="shrink-0 text-paid-ink" aria-hidden="true" />}
        {t(d.kind === 'fill' ? 'cushion.split.title' : 'cushion.gap.title')}
      </p>
      <p className="num flex justify-between gap-3 text-[15px] text-ink">
        <span>{t(d.kind === 'fill' ? 'cushion.split.in' : 'cushion.gap.out')}</span>
        <span className="font-bold" data-testid="cushion-split-amount">
          {formatEUR(d.amount / 100, { fixed: true })}
        </span>
      </p>
      {goal !== null && <CushionBar balance={d.after} goal={goal} height={8} testId="cushion-split-bar" />}
      {d.kind === 'fill' && goal !== null && (
        <p className="num text-[13px] text-ink-soft" data-testid="cushion-split-after">
          {t('cushion.split.pct', { vorher: cushionPercent(d.before, goal) ?? 0, nachher: cushionPercent(d.after, goal) ?? 0 })} ·{' '}
          {t('cushion.split.after', { betrag: eur(d.after), rest: eur(Math.max(0, goal - d.after)) })}
        </p>
      )}
      {d.kind === 'take' && (
        <p className="num text-[13px] text-ink-soft" data-testid="cushion-split-after">
          {goal === null ? eur(d.after) : t('cushion.gap.after', { betrag: eur(d.after), prozent: cushionPercent(d.after, goal) ?? 0 })}
        </p>
      )}
      {d.kind === 'fill' && (
        <p className="num flex justify-between gap-3 border-t border-edge pt-2 text-[15px] text-ink">
          <span>{t('cushion.split.free')}</span>
          <span className="font-bold" data-testid="cushion-split-free">
            {formatEUR(d.free / 100, { fixed: true })}
          </span>
        </p>
      )}
      {d.kind === 'take' && (
        <GapSalary ds={ds} period={period} active={active} plan={plan} left={left} />
      )}
      {canConfirm && d.kind === 'fill' && other && (
        <label className="flex flex-col gap-1 text-[13px] font-medium text-ink-soft">
          {t('cushion.split.amount')}
          <CentsField
            cents={d.amount}
            onCommit={(v) => setChosen(v ?? undefined)}
            testId="cushion-split-input"
          />
        </label>
      )}
      {canConfirm && (
        <button
          type="button"
          className={`${ACTION} w-full`}
          onClick={() => void confirm(d.kind === 'fill' ? d.amount : -d.amount)}
          disabled={d.amount === 0}
          data-testid="cushion-split-confirm"
        >
          {t(d.kind === 'fill' ? 'cushion.split.confirm' : 'cushion.gap.confirm')}
        </button>
      )}
      {canConfirm && d.kind === 'fill' && !other && (
        <button type="button" className={`${BUTTON} text-accent-ink`} onClick={() => setOther(true)} data-testid="cushion-split-other">
          {t('cushion.split.other')}
        </button>
      )}
    </div>
  );
}

/** „Ab € X Gehalt brauchst du den Polster nicht.“: the net salary of the month plus its gap. */
function GapSalary({ ds, period, plan, left }: { ds: Dataset; period: Period; active: Period; plan: MonthPlan; left: number }) {
  const start = useMonthStart();
  const net = useMemo(() => monthCard(ds, period, plan, start).salary.value, [ds, period, plan, start]);
  if (net === null) return null;
  return (
    <p className="num border-t border-edge pt-2 text-[13px] text-ink-soft" data-testid="cushion-split-salary">
      {t('cushion.gap.salary', { betrag: eur(salaryWithoutCushion(toCents(net), toCents(left))) })}
    </p>
  );
}

/** An amount field in cents: Enter or leaving it commits; empty = null. */
function CentsField({ cents, onCommit, testId, label }: { cents: number | null; onCommit: (v: number | null) => void; testId: string; label?: string }) {
  const [text, setText] = useState(cents === null ? '' : amountToInput(cents / 100));
  useEffect(() => setText(cents === null ? '' : amountToInput(cents / 100)), [cents]);
  const commit = () => {
    const v = parseAmount(text);
    if (text.trim() === '') return onCommit(null);
    if (v === null || v < 0) return setText(cents === null ? '' : amountToInput(cents / 100));
    onCommit(toCents(v));
  };
  return (
    <span className="flex h-12 items-center rounded-2xl border border-edge bg-field px-3 focus-within:ring-2 focus-within:ring-focus/25">
      <span className="mr-1.5 text-[17px] text-ink-mute">{currencySymbol()}</span>
      <AmountInput
        value={text}
        onChange={setText}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        aria-label={label}
        className="num h-full w-full min-w-0 bg-transparent text-[17px] font-semibold text-ink outline-none"
        data-testid={testId}
      />
    </span>
  );
}

/** The one place „Dein Polster“ lives: opened via openPolster() (the card, „Dein Plan“, the settings). */
export function PolsterHost({ ds, active }: { ds: Dataset; active: Period }) {
  const [open, setOpen] = useState<OpenPolster | null>(null);
  useEffect(
    () =>
      onOpenPolster((o) => {
        closePopover();
        setOpen(o);
      }),
    [],
  );
  if (!open) return null;
  return <PolsterSheet ds={ds} active={active} returnFocusTo={open.returnFocusTo} onClose={() => setOpen(null)} />;
}

/**
 * Screen 1, „Dein Polster“: the green card (Stand, „Ziel € X“, the bar, „{p} % · fehlt € X“, the next stage and what
 * gets there), „Damit zahlst du“ (months of fixed costs and of fixed costs plus Spielgeld, today and at the goal),
 * the two fields and the rule.
 */
export function PolsterSheet({ ds, active, onClose, returnFocusTo }: { ds: Dataset; active: Period; onClose: () => void; returnFocusTo?: HTMLElement | null }) {
  const { settings } = useKonto();
  const plan = useMonthPlan(ds, active);
  const start = useMonthStart();
  const balance = settings.cushionBalance;
  const goal = settings.cushionGoal;
  const cover = useMemo(() => cushionCover(plan, balance ?? 0, goal), [plan, balance, goal]);
  const activeLeft = useMemo(() => monthCard(ds, active, plan, start).left, [ds, active, plan, start]);
  return (
    <BottomSheet title={t('cushion.title')} onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="flex flex-col gap-5 pb-2" data-testid="polster-sheet">
        {goal !== null && <GoalCard settings={settings} activeLeft={activeLeft} active={active} />}
        {balance !== null && cover.months !== null && (
          <section className="flex flex-col gap-2.5 rounded-2xl border border-edge bg-raised p-4" data-testid="polster-pays">
            <h3 className="text-[15px] font-semibold text-ink">{t('cushion.pays')}</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <Cover n={cover.months} label={t('cushion.months')} atGoal={cover.atGoal} testId="polster-pays-fixed" />
              <Cover n={cover.monthsWithSpielgeld!} label={t('cushion.monthsSpielgeld')} atGoal={cover.atGoalWithSpielgeld} testId="polster-pays-spielgeld" />
            </div>
            <p className="num text-[12px] text-ink-mute" data-testid="polster-pays-avg">
              {cover.spielgeld > 0
                ? t('cushion.avgSpielgeld', { fix: eurRound(cover.fixed), spielgeld: eurRound(cover.spielgeld) })
                : t('cushion.avg', { fix: eurRound(cover.fixed) })}
            </p>
          </section>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold text-ink-soft">
            {t('cushion.goalField')}
            <CentsField cents={goal} onCommit={(v) => void setCushionGoal(db, v)} testId="polster-goal-input" />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold text-ink-soft">
            {t('cushion.balanceField')}
            <CentsField cents={balance} onCommit={(v) => void setCushionBalance(db, v)} testId="polster-balance-input" />
          </label>
        </div>
        <fieldset className="flex flex-col gap-2" data-testid="polster-rule" data-rule={settings.cushionRule}>
          <legend className="mb-2 text-[14px] font-semibold text-ink">{t('cushion.rule')}</legend>
          {(['all', 'share'] as const).map((rule) => (
            <label
              key={rule}
              className={`flex min-h-11 items-center gap-2.5 rounded-xl border bg-raised px-3 text-[14px] text-ink ${settings.cushionRule === rule ? 'border-accent' : 'border-edge'}`}
            >
              <input
                type="radio"
                name="polster-rule"
                checked={settings.cushionRule === rule}
                onChange={() => void setCushionRule(db, rule)}
                className="h-[18px] w-[18px] accent-accent"
                data-testid={`polster-rule-${rule}`}
              />
              {rule === 'all' ? t('cushion.rule.all') : t('cushion.rule.share', { prozent: settings.cushionShare })}
            </label>
          ))}
          {settings.cushionRule === 'share' && (
            <label className="flex items-center justify-between gap-3 px-1 text-[13px] font-medium text-ink-soft">
              {t('cushion.share')}
              <input
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                defaultValue={settings.cushionShare}
                key={settings.cushionShare}
                onBlur={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (Number.isInteger(v) && v >= 1 && v <= 99) void setCushionRule(db, 'share', v);
                }}
                className="num h-11 w-20 rounded-xl border border-edge bg-field px-3 text-right text-[16px] font-semibold text-ink"
                data-testid="polster-share-input"
              />
            </label>
          )}
        </fieldset>
      </div>
    </BottomSheet>
  );
}

function Cover({ n, label, atGoal, testId }: { n: number; label: string; atGoal: number | null; testId: string }) {
  return (
    <div className="rounded-xl bg-control p-3" data-testid={testId}>
      <p className="num text-[26px] font-bold leading-tight text-ink" data-testid={`${testId}-n`}>
        {dec(n)}
      </p>
      <p className="text-[13px] leading-snug text-ink-mute">{label}</p>
      {atGoal !== null && (
        <p className="num mt-1 text-[12px] text-ink-mute" data-testid={`${testId}-goal`}>
          {t('cushion.atGoal', { n: dec(atGoal) })}
        </p>
      )}
    </div>
  );
}

/** The green card of „Dein Polster“: Stand, „Ziel € X“, the bar, the next stage and „Noch € X bis {Etappe} %.“ */
function GoalCard({ settings, activeLeft, active }: { settings: KontoSettings; activeLeft: number | null; active: Period }) {
  const goal = settings.cushionGoal!;
  const balance = settings.cushionBalance ?? 0;
  const pct = cushionPercent(balance, goal) ?? 0;
  const next = nextStage(pct);
  const c = cushionOf(settings);
  const boost = activeLeft !== null && activeLeft > 0 && c.confirmed[active] === undefined ? distribution(toCents(activeLeft), c) : null;
  return (
    <section className="hero surface flex flex-col gap-2.5 p-5" data-testid="polster-goal-card" data-percent={pct}>
      <p className="num flex items-baseline justify-between text-[15px] text-ink-soft">
        <span>{t('cushion.done')}</span>
        <span data-testid="polster-goal">{t('cushion.goal', { betrag: eur(goal) })}</span>
      </p>
      <p className="num text-[40px] font-bold leading-tight tracking-[-0.03em] text-ink" data-testid="polster-balance">
        {eur(balance)}
      </p>
      <CushionBar balance={balance} goal={goal} height={14} testId="polster-bar" />
      <p className="num flex flex-wrap justify-between gap-x-3 text-[14px]">
        <span className="font-semibold text-ink" data-testid="polster-progress">
          {progressText(balance, goal)}
        </span>
        {next !== null && next < 100 && <span className="text-ink-soft" data-testid="polster-next">{t('cushion.nextStage', { prozent: next })}</span>}
      </p>
      {balance >= goal ? (
        <p className="rounded-xl bg-white/10 p-3 text-[15px] font-semibold text-ink" data-testid="polster-reached">
          {t('cushion.reached')}
        </p>
      ) : (
        <p className="num rounded-xl bg-white/10 p-3 text-[14px] leading-snug text-ink" data-testid="polster-nudge">
          {next !== null && t('cushion.toStage', { betrag: eur(stageAmount(goal, next) - balance), prozent: next })}
          {boost?.kind === 'fill' && (
            <>
              {' '}
              {t('cushion.boost', { monat: monthName(active), prozent: cushionPercent(boost.after, goal) ?? 0 })}
            </>
          )}
        </p>
      )}
    </section>
  );
}

/** Screen 4: the Polster-Ziel line of „Dein Plan“ – the bar, „Heute € X · {p} % · {n} Monate Fixkosten“, „ändern ›“. */
export function PlanCushionLine({ plan }: { plan: MonthPlan }) {
  const { settings } = useKonto();
  const button = useRef<HTMLButtonElement>(null);
  const balance = settings.cushionBalance ?? 0;
  const goal = settings.cushionGoal;
  const cover = useMemo(() => cushionCover(plan, balance, goal), [plan, balance, goal]);
  if (!cushionActive(cushionOf(settings)) && goal === null) return null;
  return (
    <button
      ref={button}
      type="button"
      onClick={() => openPolster({ returnFocusTo: button.current })}
      className="focus-ring flex w-full flex-col gap-2 rounded-2xl border border-edge bg-raised p-3.5 text-left"
      data-testid="plan-cushion-line"
    >
      <span className="num flex w-full justify-between gap-3 text-[15px] font-semibold text-ink">
        <span>{goal === null ? t('cushion.card') : t('plan2.cushion.goal', { betrag: eur(goal) })}</span>
        <span className="text-accent-ink">{t('plan2.cushion.change')}</span>
      </span>
      {goal !== null && <CushionBar balance={balance} goal={goal} height={10} testId="plan-cushion-bar" />}
      <span className="num text-[13px] text-ink-mute" data-testid="plan-cushion-today">
        {t('plan2.cushion.today', { betrag: eur(balance), prozent: cushionPercent(balance, goal) ?? 0, n: dec(cover.months ?? 0) })}
      </span>
    </button>
  );
}
