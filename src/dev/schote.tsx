// Dev and preview page /dev/schote/ (built only for `vite dev`, Netlify deploy previews and the e2e
// build – never for production): <PeaPod> in every state, the four states of the Fixkostenkonto tile
// and the setup including „Dein Plan“. Synthetic numbers only (no private data in any bundle).
//   ?theme=light|dark  ?view=pod|tiles|setup  ?step=account|balance|order|plan  ?plan=done
import '@fontsource-variable/inter';
import '../index.css';
import { StrictMode, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { KontoSetupSheet, type Coverage, type SetupResult, type Step } from '../components/konto/KontoSetupSheet';
import { KontoTileView, type KontoTileProps } from '../components/konto/KontoTileView';
import { PeaPod } from '../components/konto/PeaPod';
import { ToastProvider } from '../components/Toast';
import { initAurora } from '../lib/aurora';
import { initNebel } from '../lib/nebel';
import { formatEUR } from '../lib/format';
import { addPeriods, monthName } from '../lib/period';
import { cushionMonths, orderDay, podFromMonths, tileState, type Pod } from '../lib/schote';
import { initTheme } from '../lib/theme';
import type { Period } from '../lib/types';

initTheme();
const params = new URLSearchParams(location.search);
const theme = params.get('theme');
if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
initNebel();
initAurora();

const ACTIVE: Period = '2026-11';
/** rounded standing order of the example */
const ORDER = 2955;
/** „Neuer Monat beginnt am“ of the example: ?start=25 or ?start=last */
const START = params.get('start');
const DAY = orderDay(START === 'last' ? 'last' : START ? Number(START) : 1);
/** debits on the Fixkostenkonto per month (November: what is still open) – December and February are the big months */
const DEBITS = [1800, 4100, 2600, 3900, 2500, 2900, 2600, 3300, 2700, 2600, 2600, 3200];

function simulate(balance: number, firstDeposit: boolean, deposits = true) {
  let b = balance;
  const months = DEBITS.map((d, i) => {
    b += (!deposits || (i === 0 && !firstDeposit) ? 0 : ORDER) - d;
    return { period: addPeriods(ACTIVE, i), end: b };
  });
  const lowest = Math.min(...months.map((m) => m.end));
  return { months, lowest, gap: Math.max(0, -lowest) };
}

const pods = (balance: number, firstDeposit = true): Coverage => setupCoverage(balance, { firstDeposit, deposits: true });

function setupCoverage(balance: number, opts: { firstDeposit: boolean; deposits: boolean }): Coverage {
  const s = simulate(balance, opts.firstDeposit, opts.deposits);
  return { pod: podFromMonths(s.months), gap: s.gap };
}

const podOf = (ends: number[]): Pod => podFromMonths(ends.map((end, i) => ({ period: addPeriods(ACTIVE, i), end })));

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section className="mb-10" data-testid={`dev-${id}`}>
      <h2 className="section-title mb-3">{title}</h2>
      {children}
    </section>
  );
}

function PodSection() {
  const [filled, setFilled] = useState(false);
  const rows: { name: string; pod: Pod }[] = [
    { name: '0 von 12', pod: podOf(DEBITS.map(() => -1)) },
    { name: '8 von 12', pod: pods(0).pod },
    { name: '11 von 12', pod: pods(300).pod },
    { name: 'voll', pod: pods(1200).pod },
  ];
  return (
    <Section title="Schote · groß und kompakt" id="pod">
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(({ name, pod }) => (
          <div key={name} className="glass surface p-4" data-testid={`dev-pod-${name.replace(/\s/g, '-')}`}>
            <p className="mb-2 text-[12px] font-medium text-ink-faint">{name}</p>
            <PeaPod pod={pod} size="large" testId="dev-pod-large" />
            <div className="mt-4">
              <PeaPod pod={pod} size="compact" testId="dev-pod-compact" />
            </div>
          </div>
        ))}
        <div className="glass surface p-4 md:col-span-2" data-testid="dev-pod-snap">
          <p className="mb-2 text-[12px] font-medium text-ink-faint">Einrasten: 8 → 12 (Bewegung reduzieren: ohne Animation)</p>
          <PeaPod pod={pods(filled ? 580 : 0).pod} size="large" testId="dev-pod-snapper" />
          <button
            type="button"
            className="focus-ring mt-3 h-11 rounded-xl bg-accent px-4 text-[15px] font-semibold text-white"
            onClick={() => setFilled((v) => !v)}
            data-testid="dev-pod-toggle"
          >
            {filled ? 'Zurück auf 8' : 'Lücke füllen'}
          </button>
        </div>
      </div>
    </Section>
  );
}

function tileProps(balance: number, setupDone = true): Omit<KontoTileProps, 'onOpen'> {
  const s = simulate(balance, true);
  const cushion = cushionMonths(s.lowest, ORDER);
  return {
    state: tileState({ setupDone, gap: s.gap, cushion }),
    pod: podFromMonths(s.months),
    order: ORDER,
    day: DAY,
    gap: s.gap,
    cushion,
  };
}

function TilesSection() {
  // the gap tile is live: „Erledigt, eingezahlt“ puts the gap on the balance and the peas snap in
  const [balance, setBalance] = useState(0);
  const live = tileProps(balance);
  const noop = () => {};
  return (
    <Section title="Kachel · 4 Zustände" id="tiles">
      <div className="grid gap-4 md:grid-cols-2">
        <Labelled name="1 · Nicht eingerichtet">
          <KontoTileView {...tileProps(0, false)} setupSteps={0} onOpen={noop} onSetup={noop} />
        </Labelled>
        <Labelled name={`2 · Lücke (live: Kontostand ${formatEUR(balance)})`}>
          <KontoTileView {...live} onOpen={noop} onPaid={() => setBalance((b) => b + live.gap)} />
          {balance > 0 && (
            <button
              type="button"
              className="focus-ring mt-2 h-11 px-2 text-[13px] text-ink-mute underline"
              onClick={() => setBalance(0)}
              data-testid="dev-tile-reset"
            >
              Zurücksetzen
            </button>
          )}
        </Labelled>
        <Labelled name="3 · Gedeckt">
          <KontoTileView {...tileProps(1200)} onOpen={noop} />
        </Labelled>
        <Labelled name="4 · Polster">
          <KontoTileView {...tileProps(4800)} onOpen={noop} />
        </Labelled>
        <Labelled name="Serie (Phase B): 4 Monate in Folge">
          <KontoTileView {...tileProps(1200)} streak={4} onOpen={noop} />
        </Labelled>
        <Labelled name="Serie verpasst (Phase B)">
          <KontoTileView {...tileProps(1200)} streak="new" onOpen={noop} />
        </Labelled>
      </div>
    </Section>
  );
}

function Labelled({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div data-testid={`dev-tile-${name.split(' ')[0]}`}>
      <p className="mb-2 text-[12px] font-medium text-ink-faint">{name}</p>
      {children}
    </div>
  );
}

function SetupSection({ autoOpen }: { autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const [result, setResult] = useState<SetupResult | null>(null);
  const step = (params.get('step') as Step | null) ?? 'account';
  const initialResult = useMemo<Partial<SetupResult> | undefined>(() => {
    if (step !== 'plan') return undefined;
    const done = params.get('plan') === 'done';
    return {
      hasAccount: true,
      balance: 0,
      order: 'no',
      orderDone: done,
      gapDone: done,
    };
  }, [step]);
  return (
    <Section title="Einrichtung · 3 Fragen und „Dein Plan“" id="setup">
      <button
        type="button"
        className="focus-ring h-12 rounded-xl bg-accent px-5 text-[16px] font-semibold text-white"
        onClick={() => setOpen(true)}
        data-testid="dev-setup-open"
      >
        Einrichtung starten
      </button>
      {result && (
        <pre className="mt-3 overflow-x-auto rounded-xl bg-surface p-3 text-[12px] text-ink-soft" data-testid="dev-setup-result">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
      {open && (
        <KontoSetupSheet
          monthName={monthName(ACTIVE)}
          order={ORDER}
          day={DAY}
          coverage={setupCoverage}
          onClose={() => setOpen(false)}
          onFinish={(r) => (setResult(r), setOpen(false))}
          initialStep={autoOpen ? step : 'account'}
          initialResult={autoOpen ? initialResult : undefined}
        />
      )}
    </Section>
  );
}

function Page() {
  const view = params.get('view');
  return (
    <div className="mx-auto min-h-dvh max-w-[1100px] px-4 pb-24 pt-8 text-ink md:px-8">
      <h1 className="mb-1 text-[22px] font-semibold">Schote · Phase A</h1>
      <p className="mb-8 text-[14px] text-ink-mute">Beispielzahlen: Dauerauftrag {formatEUR(ORDER)}, aktiver Monat November 2026. Nur Dev und Vorschau.</p>
      {(!view || view === 'pod') && <PodSection />}
      {(!view || view === 'tiles') && <TilesSection />}
      {(!view || view === 'setup') && <SetupSection autoOpen={view === 'setup' && params.has('step')} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Page />
    </ToastProvider>
  </StrictMode>,
);
