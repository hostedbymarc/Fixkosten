import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { CalendarIcon, ChartIcon, ListIcon, SettingsIcon } from './components/Icons';
import { Brand } from './components/Logo';
import { Loader } from './components/Loader';
import { SetupDialog } from './components/SetupDialog';
import { ToastProvider } from './components/Toast';
import { useLiveQuery } from 'dexie-react-hooks';
import { needsSetup } from './db/backup';
import { db } from './db/db';
import { useDataset } from './db/useDataset';
import { hideSplash, playEntrance } from './lib/entrance';
import { toPeriod } from './lib/period';
import type { Period } from './lib/types';
import { MonthScreen } from './screens/MonthScreen';
import { PositionsScreen } from './screens/PositionsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

// Recharts is only loaded with the analysis tab, the month view stays light
const AnalyseScreen = lazy(() => import('./screens/AnalyseScreen'));

type Route = 'monat' | 'positionen' | 'analyse' | 'einstellungen';

const NAV: { route: Route; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { route: 'monat', label: 'Monat', icon: CalendarIcon },
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
  const mainRef = useRef<HTMLElement>(null);
  const loaded = !!ds;

  // the splash fades once there is something to show: the setup dialog or the data
  useEffect(() => {
    if (setup === true || (setup === false && loaded)) void hideSplash();
  }, [setup, loaded]);

  // every screen comes in (tab change, first screen after the splash); a lazy screen once its loader is gone
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main || !loaded) return;
    const loading = () => !!main.querySelector('[data-testid="loader"]');
    if (!loading()) {
      void playEntrance(main);
      return;
    }
    const observer = new MutationObserver(() => {
      if (loading()) return;
      observer.disconnect();
      void playEntrance(main);
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [route, loaded, setup]);

  if (setup === undefined) return <Loader />;
  if (setup) return <SetupDialog />;

  return (
    <ToastProvider>
      <div className="relative min-h-dvh lg:pl-[240px]">
        <Sidebar route={route} />
        <main
          ref={mainRef}
          className="pt-safe px-safe"
          style={{ paddingBottom: 'calc(var(--tabbar-space) + 16px)' }}
        >
          {!ds ? (
            <Loader />
          ) : route === 'monat' ? (
            <MonthScreen ds={ds} period={period} onPeriodChange={setPeriod} />
          ) : route === 'positionen' ? (
            <PositionsScreen ds={ds} />
          ) : route === 'analyse' ? (
            <Suspense
              fallback={
                <Loader />
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
      className="glass-strong fixed z-30 mx-auto max-w-lg rounded-[22px] px-1 lg:hidden"
      style={{
        // floating: 12 px from the edges, above the home indicator
        left: 'calc(12px + var(--safe-left))',
        right: 'calc(12px + var(--safe-right))',
        bottom: 'var(--tabbar-gap)',
      }}
      data-testid="tabbar"
    >
      <ul className="flex h-[var(--tabbar-h)]">
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
      className="glass fixed bottom-3 left-3 top-3 z-30 hidden w-[228px] flex-col px-3 py-6 lg:flex"
      data-testid="sidebar"
    >
      <div className="mb-6 flex items-center gap-2.5 px-3">
        <Brand />
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
                  active ? 'bg-accent-soft text-accent-strong' : 'text-ink-soft hover:bg-zinc-100/70'
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
