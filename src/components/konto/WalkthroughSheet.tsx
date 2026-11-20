import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useKonto } from '../../db/useKonto';
import { formatEUR } from '../../lib/format';
import { kontoState } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { monthOf, shortMonthName } from '../../lib/period';
import type { Dataset, Period } from '../../lib/types';
import { useMonthStart } from '../../lib/useToday';
import { directCount, WALK_CARDS, walkthrough, type WalkBar } from '../../lib/walkthrough';
import { COLORS } from '../analysis/chartTheme';
import { BottomSheet } from '../BottomSheet';
import { ChevronRight } from '../Icons';
import { Pea } from '../Pea';

const BIG = 'focus-ring flex min-h-12 flex-1 items-center justify-center rounded-2xl px-5 py-2.5 text-center text-[17px] font-semibold';
const PRIMARY = `${BIG} bg-accent text-white hover:bg-accent-hover`;
const SECONDARY = `${BIG} border border-control-edge bg-control text-ink hover:bg-control-track`;
/** a swipe of at least this many pixels turns the card */
const SWIPE = 48;

/**
 * „So funktioniert Erbse“: five cards, one at a time. Swipe (touch), arrow keys (keyboard), „Weiter“ /
 * „Zurück“; „Fertig“ on the last card; closable at any time (×, scrim, Esc). Numbers: kontoState, or
 * example numbers with the chip „Beispiel“ while „Fixkosten einplanen“ is not set up.
 */
export default function WalkthroughSheet({ ds, active, onClose }: { ds: Dataset; active: Period; onClose: () => void }) {
  const { settings } = useKonto();
  const start = useMonthStart();
  const w = useMemo(
    () => walkthrough(settings.enabled ? kontoState(ds, active, settings, start) : null, active, start, undefined, directCount(ds, active)),
    [ds, active, settings, start],
  );
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const last = index === WALK_CARDS - 1;
  const go = (i: number) => setIndex(Math.min(Math.max(i, 0), WALK_CARDS - 1));

  // desktop: arrow keys turn the cards
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, WALK_CARDS - 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const chip = w.example && (
    <span className="self-start rounded-full bg-control-track px-2.5 py-0.5 text-[12px] font-semibold text-ink-soft" data-testid="walkthrough-example">
      {t('walk.example')}
    </span>
  );

  const cards: ReactNode[] = [
    <Card key={1} n={1} title={t('walk.1.title')} chip={chip}>
      <p className="-mt-2 text-[14px] leading-snug text-ink-mute" data-testid="walkthrough-sub-1">
        {t('walk.1.sub')}
      </p>
      <Bars bars={w.bars} maxIndex={w.maxIndex} minIndex={w.minIndex} label={w.card1} />
      <Text testId="walkthrough-text-1">{w.card1}</Text>
      {w.card1Direct && (
        <p className="text-[14px] leading-snug text-ink-soft" data-testid="walkthrough-direct">
          {w.card1Direct}
        </p>
      )}
      {w.example && <p className="text-[13px] leading-snug text-ink-mute">{t('walk.example.note')}</p>}
    </Card>,
    <Card key={2} n={2} title={t('walk.2.title')} chip={chip}>
      <Bars bars={w.bars} maxIndex={w.maxIndex} minIndex={w.minIndex} base={w.base} label={w.card2} />
      <Text testId="walkthrough-text-2">{w.card2}</Text>
    </Card>,
    <Card key={3} n={3} title={t('walk.3.title')}>
      <Flow />
      <Text testId="walkthrough-text-3">{t('walk.3.text')}</Text>
      <p className="text-[14px] leading-snug text-ink-mute">{t('walk.3.app')}</p>
    </Card>,
    <Card key={4} n={4} title={t('walk.4.title')} chip={chip}>
      <div className="flex flex-col gap-2" data-testid="walkthrough-text-4">
        {w.card4.map((p) => (
          <Text key={p}>{p}</Text>
        ))}
      </div>
    </Card>,
    <Card key={5} n={5} title={t('walk.5.title')}>
      <div className="flex justify-center py-2" aria-hidden="true">
        <Pea size={56} />
      </div>
      <Text testId="walkthrough-text-5">{w.card5}</Text>
    </Card>,
  ];

  return (
    <BottomSheet title={t('walk.title')} onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="walkthrough" data-card={index + 1} data-example={w.example ? 'true' : 'false'}>
        <div className="-mx-1 overflow-hidden" aria-roledescription="Karussell" aria-label={t('walk.title')}>
          <div
            className={`flex touch-pan-y select-none ${drag.current ? '' : 'transition-transform duration-300 ease-out motion-reduce:transition-none'}`}
            style={{ transform: `translateX(calc(${-index * 100}% + ${dx}px))` }}
            data-testid="walkthrough-track"
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, horizontal: null };
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // a synthetic pointer (tests) has no capture
              }
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const x = e.clientX - d.x;
              const y = e.clientY - d.y;
              if (d.horizontal === null && Math.abs(x) + Math.abs(y) > 8) d.horizontal = Math.abs(x) > Math.abs(y);
              // no pulling beyond the first or the last card
              if (d.horizontal) setDx((index === 0 && x > 0) || (last && x < 0) ? x / 4 : x);
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              setDx(0);
              if (!d?.horizontal) return;
              const x = e.clientX - d.x;
              if (x <= -SWIPE) go(index + 1);
              else if (x >= SWIPE) go(index - 1);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDx(0);
            }}
          >
            {cards.map((card, i) => (
              <div key={i} className="w-full shrink-0 px-1" aria-hidden={i !== index} {...(i !== index ? { inert: '' } : {})}>
                {card}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center gap-2" role="img" aria-label={t('walk.progress', { n: index + 1, gesamt: WALK_CARDS })} data-testid="walkthrough-dots">
          {Array.from({ length: WALK_CARDS }, (_, i) => (
            <span key={i} className={`h-2 rounded-full transition-all ${i === index ? 'w-5 bg-accent' : 'w-2 bg-control-edge'}`} data-on={i === index || undefined} />
          ))}
        </div>

        <div className="flex gap-3">
          <button type="button" className={`${SECONDARY} ${index === 0 ? 'invisible' : ''}`} onClick={() => go(index - 1)} data-testid="walkthrough-back" tabIndex={index === 0 ? -1 : 0}>
            {t('walk.back')}
          </button>
          {last ? (
            <button type="button" className={PRIMARY} onClick={onClose} data-testid="walkthrough-done">
              {t('walk.done')}
            </button>
          ) : (
            <button type="button" className={PRIMARY} onClick={() => go(index + 1)} data-testid="walkthrough-next">
              {t('walk.next')}
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function Card({ n, title, chip, children }: { n: number; title: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-h-full flex-col gap-3" data-testid={`walkthrough-card-${n}`} aria-label={t('walk.progress', { n, gesamt: WALK_CARDS })}>
      {chip}
      <h3 className="text-[21px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Text({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="text-[16px] leading-snug text-ink" data-testid={testId}>
      {children}
    </p>
  );
}

const W = 336;
const H = 168;
const TOP = 30;
const BOTTOM = 22;

/** The bills of the 12 months as bars; the dearest and the cheapest labelled; with `base` the line of the base amount. */
function Bars({ bars, maxIndex, minIndex, base, label }: { bars: WalkBar[]; maxIndex: number; minIndex: number; base?: number; label: string }) {
  const slot = W / bars.length;
  const top = Math.max(...bars.map((b) => b.amount), base ?? 0, 1);
  const y = (v: number) => H - BOTTOM - ((H - BOTTOM - TOP) * v) / top;
  const marked = base === undefined ? [maxIndex, minIndex] : [];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={label} data-testid={base === undefined ? 'walkthrough-bars' : 'walkthrough-bars-base'}>
      {bars.map((b, i) => {
        const x = i * slot + slot * 0.18;
        const strong = i === maxIndex || i === minIndex;
        return (
          <g key={b.period}>
            <rect x={x} y={y(b.amount)} width={slot * 0.64} height={Math.max(H - BOTTOM - y(b.amount), 1)} rx={3} fill={strong ? COLORS.accent : COLORS.accentMuted} />
            <text x={i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={10.5} fill={strong ? COLORS.ink : COLORS.axis}>
              {shortMonthName(monthOf(b.period)).slice(0, 3)}
            </text>
          </g>
        );
      })}
      {marked.map((i) => {
        // a label near the edge is anchored to the edge, never cut (e.g. „€ 2.192,03“ over the first bar)
        const text = formatEUR(bars[i]!.amount);
        const half = text.length * 3.4;
        const mid = i * slot + slot / 2;
        const [x, anchor]: [number, 'start' | 'middle' | 'end'] = mid - half < 0 ? [1, 'start'] : mid + half > W ? [W - 1, 'end'] : [mid, 'middle'];
        return (
          <text key={i} x={x} y={y(bars[i]!.amount) - 7} textAnchor={anchor} fontSize={11.5} fontWeight={600} fill={COLORS.ink} data-testid={i === maxIndex ? 'walkthrough-max' : 'walkthrough-min'}>
            {text}
          </text>
        );
      })}
      {base !== undefined && (
        <g data-testid="walkthrough-base-line">
          <line x1={0} x2={W} y1={y(base)} y2={y(base)} stroke={COLORS.ink} strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={W} y={y(base) - 6} textAnchor="end" fontSize={11.5} fontWeight={600} fill={COLORS.ink}>
            {formatEUR(base)}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Gehalt → Rücklage / Direkt bezahlt / Spielgeld / Vermögensaufbau */
function Flow() {
  const target = 'flex min-h-10 items-center gap-2 rounded-xl border border-edge bg-field px-3 py-1.5 text-[14px] font-semibold text-ink';
  return (
    <div className="flex items-center gap-2 py-1" data-testid="walkthrough-flow">
      <div className="flex w-[30%] min-w-0 shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-edge bg-field px-1.5 py-4 text-center text-[14px] font-semibold text-ink">
        <span className="text-[22px] leading-none" aria-hidden="true">
          €
        </span>
        {t('walk.3.salary')}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-mute" aria-hidden="true" />
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        <li className={`${target} border-accent`} data-testid="walkthrough-flow-reserve">
          <Pea size={16} />
          {t('walk.3.pot')}
        </li>
        <li className={target}>{t('walk.3.direct')}</li>
        <li className={target}>{t('walk.3.spielgeld')}</li>
        <li className={target}>{t('walk.3.wealth')}</li>
      </ul>
    </div>
  );
}
