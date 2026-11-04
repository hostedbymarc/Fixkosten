// Dev and preview page /dev/schote/ (built only for `vite dev`, Netlify deploy previews and the e2e
// build – never for production): first the four states of the Fixkostenkonto tile as on the month
// screen, then the setup including „Dein Plan“, at the end the catalog of <PeaPod> sizes and states. Synthetic numbers only (no private data in any bundle).
//   ?theme=light|dark  ?view=pod|tiles|setup  ?step=account|balance|order|plan  ?plan=done
import '@fontsource-variable/inter';
import '../index.css';
import { StrictMode, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { KontoSetupSheet, type Coverage, type SetupResult, type Step } from '../components/konto/KontoSetupSheet';
import { KontoTileView, type KontoTileProps } from '../components/konto/KontoTileView';
import { PeaPod, PodAnswer } from '../components/konto/PeaPod';
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
  const rows: { name: string; pod: Pod; gap: number }[] = [
    { name: 'leer', pod: podOf(DEBITS.map(() => -1)), gap: 0 },
    { name: 'ab Februar fehlt Geld', ...pods(0) },
    { name: 'ab Mai fehlt Geld', ...pods(300) },
    { name: 'voll', ...pods(1200) },
  ];
  return (
    <Section title="Katalog · Schote groß und kompakt" id="pod">
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(({ name, pod, gap }) => (
          <div key={name} className="glass surface p-4" data-testid={`dev-pod-${name.replace(/\s/g, '-')}`}>
            <p className="mb-2 text-[12px] font-medium text-ink-faint">{name}</p>
            <PodAnswer pod={pod} gap={gap} testId="dev-pod-answer" />
            <PeaPod pod={pod} size="large" testId="dev-pod-large" />
            <div className="mt-4">
              <PeaPod pod={pod} size="compact" testId="dev-pod-compact" />
            </div>
          </div>
        ))}
        <div className="glass surface p-4 md:col-span-2" data-testid="dev-pod-snap">
          <p className="mb-2 text-[12px] font-medium text-ink-faint">Einrasten: 3 → 12 (Bewegung reduzieren: ohne Animation)</p>
          <PodAnswer pod={pods(filled ? 580 : 0).pod} gap={pods(filled ? 580 : 0).gap} testId="dev-pod-snapper-answer" />
          <PeaPod pod={pods(filled ? 580 : 0).pod} size="large" testId="dev-pod-snapper" />
          <button
            type="button"
            className="focus-ring mt-3 h-11 rounded-xl bg-accent px-4 text-[15px] font-semibold text-white"
            onClick={() => setFilled((v) => !v)}
            data-testid="dev-pod-toggle"
          >
            {filled ? 'Zurück auf 3' : 'Lücke füllen'}
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
  const states: { id: string; title: string; note: string; tile: ReactNode }[] = [
    {
      id: '1',
      title: '1 · Noch nicht eingerichtet',
      note: 'Bevor du die drei Fragen beantwortet hast.',
      tile: <KontoTileView {...tileProps(0, false)} setupSteps={0} onOpen={noop} onSetup={noop} />,
    },
    {
      id: '2',
      title: '2 · Es fehlt Geld',
      note: `Kontostand ${formatEUR(balance)}. „Erledigt, eingezahlt“ funktioniert hier live.`,
      tile: (
        <>
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
        </>
      ),
    },
    { id: '3', title: '3 · Alles gedeckt', note: `Kontostand ${formatEUR(1200)}.`, tile: <KontoTileView {...tileProps(1200)} onOpen={noop} /> },
    {
      id: '4',
      title: '4 · Gedeckt mit Polster',
      note: `Kontostand ${formatEUR(4800)}: mehr als ein Dauerauftrag bleibt übrig.`,
      tile: <KontoTileView {...tileProps(4800)} onOpen={noop} />,
    },
  ];
  return (
    <div data-testid="dev-tiles">
      {states.map((st) => (
        <section key={st.id} className="mb-10" data-testid={`dev-tile-${st.id}`}>
          <h2 className="mb-1 text-[20px] font-semibold leading-tight text-ink">{st.title}</h2>
          <p className="mb-3 text-[14px] text-ink-mute">{st.note}</p>
          {/* as wide as on the month screen */}
          <div className="max-w-[540px]">{st.tile}</div>
        </section>
      ))}
      <Section title="Phase B: Serie" id="streak">
        <div className="grid max-w-[1100px] gap-4 md:grid-cols-2">
          <Labelled name="Serie: 4 Monate in Folge">
            <KontoTileView {...tileProps(1200)} streak={4} onOpen={noop} />
          </Labelled>
          <Labelled name="Serie verpasst">
            <KontoTileView {...tileProps(1200)} streak="new" onOpen={noop} />
          </Labelled>
        </div>
      </Section>
    </div>
  );
}

function Labelled({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
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
      <h1 className="mb-1 text-[22px] font-semibold">Schote · Fixkostenkonto-Kachel</h1>
      <p className="mb-8 text-[14px] text-ink-mute">
        Beispielzahlen: Dauerauftrag {formatEUR(ORDER)} {DAY}, aktiver Monat November 2026. Nur Dev und Vorschau.
      </p>
      {(!view || view === 'tiles') && <TilesSection />}
      {(!view || view === 'setup') && <SetupSection autoOpen={view === 'setup' && params.has('step')} />}
      {(!view || view === 'pod') && <PodSection />}
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
