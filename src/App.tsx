import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { ChartIcon, ListIcon, MonthIcon, SettingsIcon } from './components/Icons';
import { LogoMark } from './components/Logo';
import { SetupDialog } from './components/SetupDialog';
import { ToastProvider } from './components/Toast';
import { useLiveQuery } from 'dexie-react-hooks';
import { needsSetup } from './db/backup';
import { db } from './db/db';
import { useDataset } from './db/useDataset';
import { toPeriod } from './lib/period';
import type { Period } from './lib/types';
import { MonthScreen } from './screens/MonthScreen';
import { PositionsScreen } from './screens/PositionsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

// Recharts is only loaded with the analysis tab, the month view stays light
const AnalyseScreen = lazy(() => import('./screens/AnalyseScreen'));

type Route = 'monat' | 'positionen' | 'analyse' | 'einstellungen';

const NAV: { route: Route; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { route: 'monat', label: 'Monat', icon: MonthIcon },
  { route: 'positionen', label: 'Positionen', icon: ListIcon },
  { route: 'analyse', label: 'Analyse', icon: ChartIcon },
  { route: 'einstellungen', label: 'Einstellungen', icon: SettingsIcon },
];

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return NAV.some((n) => n.route === hash) ? (hash as Route) : 'monat';
}

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export function App() {
  const route = useHashRoute();
  const ds = useDataset();
  const setup = useLiveQuery(() => needsSetup(db), []);
  const [period, setPeriod] = useState<Period>(() => toPeriod(new Date()));

  if (setup === undefined) return null;
  if (setup) return <SetupDialog />;

  return (
    <ToastProvider>
      <div className="relative min-h-dvh lg:pl-[240px]">
        <Sidebar route={route} />
        <main
          className="pt-safe px-safe"
          style={{ paddingBottom: 'calc(var(--tabbar-h) + var(--safe-bottom) + 16px)' }}
        >
          {!ds ? (
            <div className="p-8 text-center text-ink-mute" aria-busy="true">
              Lädt …
            </div>
          ) : route === 'monat' ? (
            <MonthScreen ds={ds} period={period} onPeriodChange={setPeriod} />
          ) : route === 'positionen' ? (
            <PositionsScreen ds={ds} />
          ) : route === 'analyse' ? (
            <Suspense
              fallback={
                <div className="p-8 text-center text-ink-mute" aria-busy="true">
                  Lädt …
                </div>
              }
            >
              <AnalyseScreen ds={ds} />
            </Suspense>
          ) : (
            <SettingsScreen ds={ds} />
          )}
        </main>
        <TabBar route={route} />
      </div>
    </ToastProvider>
  );
}

function TabBar({ route }: { route: Route }) {
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/80 backdrop-blur-xl backdrop-saturate-150 lg:hidden"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
      data-testid="tabbar"
    >
      <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-lg px-safe">
        {NAV.map(({ route: r, label, icon: Icon }) => {
          const active = r === route;
          return (
            <li key={r} className="flex-1">
              <a
                href={`#/${r}`}
                aria-current={active ? 'page' : undefined}
                className={`focus-ring flex h-full flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] ${
                  active ? 'font-semibold text-accent-ink' : 'font-medium text-ink-mute'
                }`}
              >
                <span
                  className={`flex h-[30px] w-[54px] items-center justify-center rounded-full transition-colors ${
                    active ? 'bg-accent-soft' : ''
                  }`}
                >
                  <Icon size={22} />
                </span>
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Sidebar({ route }: { route: Route }) {
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-line bg-surface px-3 py-6 lg:flex"
      data-testid="sidebar"
    >
      <div className="mb-6 flex items-center gap-2.5 px-3">
        <LogoMark size={32} />
        <span className="text-[18px] font-semibold tracking-[-0.03em] text-ink">fixkosten</span>
      </div>
      <ul className="flex flex-col gap-1">
        {NAV.map(({ route: r, label, icon: Icon }) => {
          const active = r === route;
          return (
            <li key={r}>
              <a
                href={`#/${r}`}
                aria-current={active ? 'page' : undefined}
                className={`focus-ring flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium ${
                  active ? 'bg-accent-soft text-accent-strong' : 'text-ink-soft hover:bg-zinc-100'
                }`}
              >
                <Icon size={20} />
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
