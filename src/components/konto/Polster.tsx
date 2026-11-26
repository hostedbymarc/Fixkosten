// polster-ziel (Design-Canvas „Erbse – Polster-Ziel Mockups“, Screens 1–5): the Polster and its goal. Every number
// comes from src/lib/polster.ts (cents), which reads the month cards (monthCard) and the plan (monthPlan). The
// Polster changes only when the user confirms („Polster aufgefüllt“ / „Aus Polster genommen“) or enters it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../db/db';
import {
  addCushionMove,
  confirmCushion,
  removeCushionMove,
  setCushionBalance,
  setCushionGoal,
  setCushionRule,
  settleCushionDiff,
  undoCushion,
  CushionWriteError,
} from '../../db/kontoActions';
import { CUSHION_NOTE_MAX, type CushionMove, type KontoSettings } from '../../db/settings';
import { useKonto } from '../../db/useKonto';
import { amountToInput, currencySymbol, formatDate, formatEUR, parseAmount } from '../../lib/format';
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
  fieldWrite,
  movesNewestFirst,
  nextStage,
  projectCushion,
  salaryWithoutCushion,
  stageAmount,
  surplusDiff,
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
 * A tap opens „Dein Polster“. polster-feinschliff: „+ Einzahlen“ / „− Entnehmen“ open it with the field.
 */
export function PolsterCard({ plan }: { plan: MonthPlan }) {
  const { settings } = useKonto();
  const button = useRef<HTMLButtonElement>(null);
  const balance = settings.cushionBalance ?? 0;
  const goal = settings.cushionGoal;
  const cover = useMemo(() => cushionCover(plan, balance, goal), [plan, balance, goal]);
  const moves = goal !== null || settings.cushionBalance !== null;
  return (
    <div
      className="glass glass-tile surface flex w-full min-w-0 flex-col gap-1 p-2 md:p-3"
      data-testid="polster-card"
      data-goal={goal ?? undefined}
      data-balance={settings.cushionBalance ?? undefined}
    >
      <button
        ref={button}
        type="button"
        onClick={() => openPolster({ returnFocusTo: button.current })}
        className="press focus-ring flex w-full min-w-0 flex-col gap-2.5 rounded-2xl p-2 text-left"
        data-testid="polster-card-open"
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
      {moves && <MoveButtons onMove={(dir, el) => openPolster({ returnFocusTo: el, move: dir })} testId="polster-card" />}
    </div>
  );
}

/** „+ Einzahlen“ / „− Entnehmen“ */
function MoveButtons({ onMove, testId, active }: { onMove: (dir: 'in' | 'out', el: HTMLButtonElement) => void; testId: string; active?: 'in' | 'out' | null }) {
  return (
    <span className="grid grid-cols-2 gap-2">
      {(['in', 'out'] as const).map((dir) => (
        <button
          key={dir}
          type="button"
          onClick={(e) => onMove(dir, e.currentTarget)}
          aria-pressed={active === undefined ? undefined : active === dir}
          className={`${BUTTON} press bg-control text-ink ${active === dir ? 'ring-2 ring-accent' : ''}`}
          data-testid={`${testId}-${dir}`}
        >
          {t(dir === 'in' ? 'cushion.move.in' : 'cushion.move.out')}
        </button>
      ))}
    </span>
  );
}

/**
 * Screens 2 and 3, in the green card under the Überschuss: „So verteilst du den Überschuss“ (Überschuss > 0, goal not
 * reached), „Dein Polster deckt die Lücke“ (Überschuss < 0, Polster > 0), „Polster voll · …“ (goal reached). With a
 * button in the active month and in past months not confirmed yet; a muted preview without a button in later months.
 * Confirmed: the amount and „Rückgängig“ (the active month); a later change of the Überschuss: the difference.
 * Crossing a stage: the confetti, once per stage – in a strip of its own under the text (polster-feinschliff).
 */
export function CushionSplit({ ds, period, active, left }: { ds: Dataset; period: Period; active: Period; left: number }) {
  const { settings } = useKonto();
  const plan = useMonthPlan(ds, active);
  const toast = useToast();
  const { c, proj } = useCushionPlan(ds, plan);
  // „Anders aufteilen“: the field's text; its amount counts as soon as it is a valid one
  const [other, setOther] = useState<string | null>(null);
  const [party, setParty] = useState<{ run: number; goal: boolean } | null>(null);
  const guard = useCushionWrite();
  const future = period > active;
  const confirmed = c.confirmed[period];
  const surplus = toCents(left);
  // „Rückgängig“: the celebration is over (a stage is celebrated only once)
  const undo = () => {
    setParty(null);
    void guard(undoCushion(db, period));
  };
  const celebrate = (stages: number[]) => {
    if (stages.length) setParty((p) => ({ run: (p?.run ?? 0) + 1, goal: stages.includes(100) }));
  };
  // a later month: from the Polster planned before it
  const base = future ? cushionBefore(proj, period, c) : c.balance;
  const parsed = other === null ? null : parseAmount(other);
  const chosen = parsed === null || parsed < 0 ? undefined : toCents(parsed);
  const d = distribution(surplus, { ...c, balance: base }, chosen);
  if (!future && confirmed !== undefined) {
    if (period !== active) return null;
    return (
      <div className="confetti-host mt-3 flex flex-col gap-1 rounded-2xl bg-white/5 px-3 py-1.5" data-testid="cushion-split" data-kind="confirmed" data-confetti={party ? '' : undefined}>
        {party && <Confetti key={`cushion-${party.run}`} seed={`cushion-${period}-${party.run}`} falling />}
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          <p className="num flex min-h-11 items-center gap-2 text-[14px] font-semibold text-ink" data-testid="cushion-split-confirmed">
            <CheckIcon size={16} strokeWidth={2.6} className="shrink-0 text-paid-ink" aria-hidden="true" />
            {t(confirmed > 0 ? 'cushion.in.done' : 'cushion.out.done', { betrag: eur(Math.abs(confirmed)) })}
          </p>
          <button type="button" className={`${BUTTON} -mr-2 text-accent-ink`} onClick={undo} data-testid="cushion-split-undo">
            {t('cushion.undo')}
          </button>
        </div>
        {party?.goal && (
          <p className="text-[15px] font-semibold text-ink" data-testid="cushion-split-reached">
            {t('cushion.reached')}
          </p>
        )}
        <SurplusDiff period={period} surplus={surplus} remembered={c.surplus?.[period]} onStages={celebrate} />
      </div>
    );
  }
  if (!d) return null;
  const canConfirm = !future;
  const confirm = async (amount: number) => {
    const stages = await guard(confirmCushion(db, period, amount, undefined, surplus));
    if (!stages) return;
    // an own amount: the field closes
    setOther(null);
    celebrate(stages);
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
      {d.kind === 'take' && <GapSalary ds={ds} period={period} active={active} plan={plan} left={left} />}
      {canConfirm && d.kind === 'fill' && other !== null && (
        <div className="flex flex-col gap-1" data-testid="cushion-split-other-field">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-ink-soft">
            {t('cushion.split.amount')}
            <TextCents value={other} onChange={setOther} onEnter={() => void confirm(d.amount)} testId="cushion-split-input" autoFocus />
          </label>
          <button type="button" className={`${BUTTON} self-start -ml-2 text-ink-soft`} onClick={() => setOther(null)} data-testid="cushion-split-cancel">
            {t('cushion.split.cancel')}
          </button>
        </div>
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
      {canConfirm && d.kind === 'fill' && (
        <button
          type="button"
          className={`${BUTTON} text-accent-ink`}
          onClick={() => setOther((o) => (o === null ? amountToInput(d.amount / 100) : null))}
          aria-expanded={other !== null}
          data-testid="cushion-split-other"
        >
          {t('cushion.split.other')}
        </button>
      )}
    </div>
  );
}

/**
 * The Überschuss of a confirmed month changed (polster-feinschliff, a month's amount edited): „Dein Überschuss ist
 * € X höher/niedriger.“ – „Differenz in den Polster“ / „Differenz entnehmen“ (a move) or „Passt so“.
 */
function SurplusDiff({ period, surplus, remembered, onStages }: { period: Period; surplus: number; remembered: number | undefined; onStages: (s: number[]) => void }) {
  const toast = useToast();
  const guard = useCushionWrite();
  const diff = surplusDiff(remembered, surplus);
  if (diff === 0) return null;
  const settle = async (move: boolean) => {
    const r = await guard(settleCushionDiff(db, period, surplus, move));
    if (!r) return;
    onStages(r.stages);
    toast({
      message: t(r.amount > 0 ? 'cushion.toast.in' : 'cushion.toast.out', { betrag: eur(Math.abs(r.amount)) }),
      actionLabel: t('cushion.undo'),
      onAction: () => void guard(removeCushionMove(db, r.id)),
      durationMs: 5000,
    });
  };
  return (
    <div className="flex flex-col gap-2 border-t border-edge py-2" data-testid="cushion-diff" data-diff={diff}>
      <p className="num text-[14px] font-medium text-ink" data-testid="cushion-diff-text">
        {t(diff > 0 ? 'cushion.diff.higher' : 'cushion.diff.lower', { betrag: eur(Math.abs(diff)) })}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${ACTION} flex-1`} onClick={() => void settle(true)} data-testid="cushion-diff-move">
          {t(diff > 0 ? 'cushion.diff.in' : 'cushion.diff.out')}
        </button>
        <button type="button" className={`${BUTTON} text-accent-ink`} onClick={() => void settle(false)} data-testid="cushion-diff-ok">
          {t('cushion.diff.ok')}
        </button>
      </div>
    </div>
  );
}

/** An amount typed in (euros with cents); the parent reads it. */
function TextCents({ value, onChange, onEnter, testId, autoFocus, label }: { value: string; onChange: (v: string) => void; onEnter?: () => void; testId: string; autoFocus?: boolean; label?: string }) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) field.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <span className="flex h-12 items-center rounded-2xl border border-edge bg-field px-3 focus-within:ring-2 focus-within:ring-focus/25">
      <span className="mr-1.5 text-[17px] text-ink-mute">{currencySymbol()}</span>
      <AmountInput
        ref={field}
        value={value}
        onChange={onChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        aria-label={label}
        className="num h-full w-full min-w-0 bg-transparent text-[17px] font-semibold text-ink outline-none"
        data-testid={testId}
      />
    </span>
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

/**
 * „Aktueller Stand“ / „Polster-Ziel“ (polster-stand-feld): an amount field in cents that writes only with Enter or
 * „Speichern“, and only a real change (fieldWrite) – never when it mounts, loses the focus, re-renders or the sheet
 * closes. Emptied and saved: removed. „Speichern“ shows while the field differs from what is stored.
 */
function CentsField({ cents, onCommit, testId, label }: { cents: number | null; onCommit: (v: number | null) => Promise<void>; testId: string; label?: string }) {
  const shown = cents === null ? '' : amountToInput(cents / 100);
  const [text, setText] = useState(shown);
  const field = useRef<HTMLInputElement>(null);
  // the stored value changed (saved, or elsewhere): the field shows it
  useEffect(() => setText(shown), [shown]);
  // what is in the field right now (under load Enter can come before the render of the last key)
  const now = () => field.current?.value ?? text;
  const pending = fieldWrite(text, cents, parseAmount).write;
  const save = () => {
    const w = fieldWrite(now(), cents, parseAmount);
    if (w.write) void onCommit(w.value);
  };
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex h-12 items-center rounded-2xl border border-edge bg-field px-3 focus-within:ring-2 focus-within:ring-focus/25">
        <span className="mr-1.5 text-[17px] text-ink-mute">{currencySymbol()}</span>
        <AmountInput
          ref={field}
          value={text}
          onChange={setText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
          aria-label={label}
          className="num h-full w-full min-w-0 bg-transparent text-[17px] font-semibold text-ink outline-none"
          data-testid={testId}
        />
      </span>
      {pending && (
        <button type="button" onClick={save} className={`${BUTTON} min-h-11 self-start bg-control px-3 text-[14px] text-ink`} data-testid={`${testId}-save`}>
          {t('cushion.field.save')}
        </button>
      )}
    </span>
  );
}

/** Every write of the Polster: if it would break the Polster (CushionWriteError), nothing is written – the hint says so. */
function useCushionWrite() {
  const toast = useToast();
  return <T,>(p: Promise<T>): Promise<T | undefined> =>
    p.catch((e: unknown) => {
      if (!(e instanceof CushionWriteError)) throw e;
      toast({ message: t('cushion.saveFailed'), durationMs: 5000 });
      return undefined;
    });
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
  return <PolsterSheet ds={ds} active={active} returnFocusTo={open.returnFocusTo} move={open.move} onClose={() => setOpen(null)} />;
}

/**
 * Screen 1, „Dein Polster“: the green card (Stand, „Ziel € X“, the bar, „{p} % · fehlt € X“, the next stage and what
 * gets there), „+ Einzahlen“ / „− Entnehmen“ (polster-feinschliff), „Damit zahlst du“ (months of fixed costs and of
 * fixed costs plus Spielgeld, today and at the goal), the two fields, the rule and „Verlauf“.
 */
export function PolsterSheet({
  ds,
  active,
  onClose,
  returnFocusTo,
  move,
}: {
  ds: Dataset;
  active: Period;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  move?: 'in' | 'out';
}) {
  const { settings } = useKonto();
  const plan = useMonthPlan(ds, active);
  const start = useMonthStart();
  const balance = settings.cushionBalance;
  const goal = settings.cushionGoal;
  const cover = useMemo(() => cushionCover(plan, balance ?? 0, goal), [plan, balance, goal]);
  const activeLeft = useMemo(() => monthCard(ds, active, plan, start).left, [ds, active, plan, start]);
  const [dir, setDir] = useState<'in' | 'out' | null>(move ?? null);
  const [party, setParty] = useState<{ run: number; goal: boolean } | null>(null);
  const guard = useCushionWrite();
  const celebrate = (stages: number[]) => {
    if (stages.length) setParty((p) => ({ run: (p?.run ?? 0) + 1, goal: stages.includes(100) }));
  };
  return (
    <BottomSheet title={t('cushion.title')} onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="flex flex-col gap-5 pb-2" data-testid="polster-sheet">
        {goal !== null && <GoalCard settings={settings} activeLeft={activeLeft} active={active} party={party} />}
        <div className="flex flex-col gap-2.5" data-testid="polster-moves">
          <MoveButtons onMove={(d) => setDir((x) => (x === d ? null : d))} testId="polster" active={dir} />
          {dir && <MoveForm key={dir} dir={dir} balance={balance ?? 0} onDone={() => setDir(null)} onStages={celebrate} />}
        </div>
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
            <CentsField cents={goal} onCommit={(v) => guard(setCushionGoal(db, v)).then(() => undefined)} testId="polster-goal-input" />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold text-ink-soft">
            {t('cushion.balanceField')}
            <CentsField cents={balance} onCommit={(v) => guard(setCushionBalance(db, v)).then(() => undefined)} testId="polster-balance-input" />
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
        <History moves={settings.cushionMoves} />
      </div>
    </BottomSheet>
  );
}

/** „+ Einzahlen“ / „− Entnehmen“: amount (cents), an optional note (≤ 40 characters), today. Rückgängig via the hint. */
function MoveForm({ dir, balance, onDone, onStages }: { dir: 'in' | 'out'; balance: number; onDone: () => void; onStages: (s: number[]) => void }) {
  const toast = useToast();
  const guard = useCushionWrite();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const value = parseAmount(text);
  const cents = value === null || value <= 0 ? 0 : toCents(value);
  const valid = cents > 0 && (dir === 'in' || balance > 0);
  const save = async () => {
    if (!valid) return;
    const r = await guard(addCushionMove(db, dir === 'in' ? cents : -cents, note));
    if (!r) return;
    onStages(r.stages);
    onDone();
    toast({
      message: t(r.amount > 0 ? 'cushion.toast.moveIn' : 'cushion.toast.moveOut', { betrag: eur(Math.abs(r.amount)) }),
      actionLabel: t('cushion.undo'),
      onAction: () => void guard(removeCushionMove(db, r.id)),
      durationMs: 5000,
    });
  };
  return (
    <form
      className="flex flex-col gap-2.5 rounded-2xl border border-edge bg-raised p-3.5"
      data-testid="polster-move-form"
      data-dir={dir}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-soft">
        {t('cushion.move.amount')}
        <TextCents value={text} onChange={setText} testId="polster-move-amount" autoFocus />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-soft">
        {t('cushion.move.note')}
        <input
          type="text"
          value={note}
          maxLength={CUSHION_NOTE_MAX}
          onChange={(e) => setNote(e.currentTarget.value)}
          className="h-12 rounded-2xl border border-edge bg-field px-3 text-[16px] text-ink"
          data-testid="polster-move-note"
        />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" className={`${ACTION} flex-1`} disabled={!valid} data-testid="polster-move-save">
          {t(dir === 'in' ? 'cushion.move.in.save' : 'cushion.move.out.save')}
        </button>
        <button type="button" className={`${BUTTON} text-ink-soft`} onClick={onDone} data-testid="polster-move-cancel">
          {t('cushion.move.cancel')}
        </button>
      </div>
    </form>
  );
}

/** „Verlauf“: the last 5 moves (Datum · Notiz/Quelle · ±Betrag), „Alle anzeigen ›“. */
function History({ moves }: { moves: CushionMove[] }) {
  const [all, setAll] = useState(false);
  const list = useMemo(() => movesNewestFirst(moves), [moves]);
  const shown = all ? list : list.slice(0, 5);
  return (
    <section className="flex flex-col gap-1.5" data-testid="polster-history" data-count={moves.length}>
      <h3 className="text-[15px] font-semibold text-ink">{t('cushion.history')}</h3>
      {list.length === 0 ? (
        <p className="text-[14px] text-ink-mute">{t('cushion.history.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {shown.map((m) => (
            <li key={m.id} className="num flex items-baseline justify-between gap-3 py-2 text-[14px]" data-testid="polster-history-row" data-source={m.source} data-cents={m.amount}>
              <span className="min-w-0 text-ink-soft">
                <span className="text-ink-mute">{formatDate(m.date)}</span> · <span className="break-words text-ink">{moveLabel(m)}</span>
              </span>
              <span className={`shrink-0 font-semibold ${m.amount < 0 ? 'text-ink' : 'text-paid-ink'}`}>
                {m.amount < 0 ? '−' : '+'}
                {eur(Math.abs(m.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {list.length > 5 && (
        <button type="button" className={`${BUTTON} self-start -ml-2 text-accent-ink`} onClick={() => setAll((a) => !a)} aria-expanded={all} data-testid="polster-history-all">
          {t(all ? 'cushion.history.less' : 'cushion.history.all')}
        </button>
      )}
    </section>
  );
}

/** The note, else where the move came from („Polster aufgefüllt · Dezember“, „Eingezahlt“, „Stand eingetragen“). */
function moveLabel(m: CushionMove): string {
  if (m.note) return m.note;
  const month = /^m-(\d{4}-\d{2})/.exec(m.id)?.[1];
  const of = month ? ` · ${monthName(month)}` : '';
  if (m.id.includes('-diff')) return `${t('cushion.src.diff')}${of}`;
  if (m.source === 'split') return `${t('cushion.src.split')}${of}`;
  if (m.source === 'gap') return `${t('cushion.src.gap')}${of}`;
  if (m.source === 'start') return t('cushion.src.start');
  if (m.source === 'fix') return t('cushion.src.fix');
  return t(m.amount < 0 ? 'cushion.src.out' : 'cushion.src.in');
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
function GoalCard({
  settings,
  activeLeft,
  active,
  party,
}: {
  settings: KontoSettings;
  activeLeft: number | null;
  active: Period;
  party: { run: number; goal: boolean } | null;
}) {
  const goal = settings.cushionGoal!;
  const balance = settings.cushionBalance ?? 0;
  const pct = cushionPercent(balance, goal) ?? 0;
  const next = nextStage(pct);
  const c = cushionOf(settings);
  const boost = activeLeft !== null && activeLeft > 0 && c.confirmed[active] === undefined ? distribution(toCents(activeLeft), c) : null;
  return (
    <section className="hero surface flex flex-col gap-2.5 p-5" data-testid="polster-goal-card" data-percent={pct} data-done={party ? '' : undefined}>
      {/* a stage crossed by a move: the confetti in the strip at the bottom of the card */}
      {party && <Confetti key={`polster-${party.run}`} seed={`polster-${party.run}`} falling />}
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
