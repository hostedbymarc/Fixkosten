import { lazy, memo, startTransition, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar, TabBar } from './components/Navigation';
import { TabVisibleContext } from './components/Screen';
import { Skeleton } from './components/Skeleton';
import { SetupDialog } from './components/SetupDialog';
import { ToastProvider } from './components/Toast';
import { useLiveQuery } from 'dexie-react-hooks';
import { needsSetup } from './db/backup';
import { db } from './db/db';
import { useDataset } from './db/useDataset';
import { activeMonth, localToday, MONTH_START_KEY, toMonthStart, type MonthStart } from './lib/activeMonth';
import { hideSplash } from './lib/entrance';
import { startGlassBudget } from './lib/glassBudget';
import { NAV, readRoute, type Route } from './lib/routes';
import { switchTab } from './lib/tabTransition';
import { ActiveMonthContext } from './lib/useToday';
import type { Dataset, Period } from './lib/types';
import { MonthScreen } from './screens/MonthScreen';
import { PositionsScreen } from './screens/PositionsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

// Recharts lives in the analysis chunk: never part of the start (the month view stays light). It is
// fetched once the app is idle after its start, so the first visit of the tab does not compile code
// while the tab transition plays; until then (or if the visit comes first) it loads on demand.
const loadAnalyse = () => import('./screens/AnalyseScreen');
const AnalyseScreen = lazy(loadAnalyse);
const PREFETCH_AFTER_MS = 1200;

/** Time the off-screen warm-up render stays mounted (its charts mount one per frame). */
const WARM_MS = 1000;

/**
 * Idle after the start: fetch the analysis chunk and render the screen once, off screen and invisible. The browser compiles Recharts and the analysis code there,
 * not during the first visit's tab transition.
 */
function prefetchAnalyse(ds: Dataset, context: { start: MonthStart; active: Period }): () => void {
  const done = () => {
    document.documentElement.dataset.analyseReady = '';
  };
  const run = () =>
    void loadAnalyse().then(({ default: Screen }) => {
      // off screen, invisible, in a closed shadow root: it has a size (the charts measure it) but
      // nothing outside – no query, no assistive technology, no blur budget – ever sees it
      const host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.inert = true;
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:390px;height:900px;overflow:hidden;visibility:hidden;pointer-events:none';
      const mount = document.createElement('div');
      host.attachShadow({ mode: 'closed' }).appendChild(mount);
      document.body.appendChild(host);
      const root = createRoot(mount);
      root.render(
        <ActiveMonthContext.Provider value={context}>
          <Screen ds={ds} />
        </ActiveMonthContext.Provider>,
      );
      window.setTimeout(() => {
        root.unmount();
        host.remove();
        done();
      }, WARM_MS);
    }, () => {});
  // not before the start screen has come in, then when the browser is idle (Safari has no
  // requestIdleCallback: right then)
  let idle = 0;
  const timer = setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(run, { timeout: 2000 });
    else run();
  }, PREFETCH_AFTER_MS);
  return () => {
    clearTimeout(timer);
    if (idle) window.cancelIdleCallback(idle);
  };
}

/** The skeleton of a lazy tab while its code loads – only for the tab that is shown. */
function TabSkeleton() {
  return useContext(TabVisibleContext) ? <Skeleton /> : null;
}

/**
 * The screen of one tab. Memoised and without a say in whether it is shown (that comes through
 * TabVisibleContext to its Screen): a tab switch does not render the screens again.
 */
const TabScreen = memo(function TabScreen({ tab, ds, period, onPeriodChange }: { tab: Route; ds: Dataset; period: Period; onPeriodChange: (p: Period) => void }) {
  if (tab === 'monat') return <MonthScreen ds={ds} period={period} onPeriodChange={onPeriodChange} />;
  if (tab === 'positionen') return <PositionsScreen ds={ds} />;
  if (tab === 'einstellungen') return <SettingsScreen ds={ds} />;
  return (
    <Suspense fallback={<TabSkeleton />}>
      <AnalyseScreen ds={ds} />
    </Suspense>
  );
});

/** Manual month navigation keeps the shown month this long before the app returns to the active one. */
const NAV_HOLD_MS = 30 * 60_000;

/** The route from the URL; a tab change plays the tab transition, every tab keeps its scroll position. */
function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute);
  const current = useRef(route);
  const scroll = useRef(new Map<Route, number>());
  // resolves the tab transition's update once the new tab is committed
  const committed = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    committed.current?.();
    committed.current = null;
  }, [route]);
  useEffect(() => {
    const onHash = () => {
      const next = readRoute();
      const prev = current.current;
      if (next === prev) return;
      scroll.current.set(prev, window.scrollY);
      current.current = next;
      switchTab(
        prev,
        next,
        () =>
          new Promise<void>((resolve) => {
            const finish = () => {
              window.scrollTo(0, scroll.current.get(next) ?? 0);
              resolve();
            };
            committed.current = finish;
            // rendered in slices: no long task while the transition captures the old picture
            startTransition(() => setRoute(next));
            // never leave the transition waiting (e.g. a newer tab change took over)
            window.setTimeout(() => {
              if (committed.current === finish) committed.current = null;
              resolve();
            }, 1500);
          }),
      );
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export function App() {
  const route = useHashRoute();
  // tabs stay built once visited (hidden while another is shown): going back to one only shows it,
  // React does not build it anew in the frame the tab transition captures
  const visited = useRef(new Set<Route>());
  visited.current.add(route);
  const ds = useDataset();
  const setup = useLiveQuery(() => needsSetup(db), []);
  const start = useLiveQuery(async () => toMonthStart((await db.meta.get(MONTH_START_KEY))?.value), []);
  const [now, setNow] = useState(localToday);
  const active = start === undefined ? null : activeMonth(now, start);
  const [shown, setShown] = useState<Period | null>(null);
  const period = shown ?? active;
  // manual navigation (arrows, swipe, month grid, „Zum aktiven Monat“) holds the shown month for 30 min
  const navigatedAt = useRef(0);
  const setPeriod = useCallback((p: Period) => {
    navigatedAt.current = Date.now();
    setShown(p);
  }, []);
  const followActive = useRef<() => void>(() => {});
  followActive.current = () => {
    if (active && Date.now() - navigatedAt.current > NAV_HOLD_MS) setShown(active);
  };
  // the clock: every minute and on return from the background (the active month may have moved on)
  useEffect(() => {
    const tick = () => setNow(localToday());
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      tick();
      followActive.current();
    };
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  // a new active month (new day, changed setting) is shown unless the user just navigated
  useEffect(() => followActive.current(), [active]);
  // data and the setting „Neuer Monat beginnt am“: only then is there a screen to show
  const loaded = !!ds && start !== undefined;

  // the splash fades once there is something to show: the setup dialog or the data
  useEffect(() => {
    if (setup === true || (setup === false && loaded)) void hideSplash();
  }, [setup, loaded]);

  // at most 8 blur surfaces per screen, the visible ones first (src/lib/glassBudget.ts)
  useEffect(() => startGlassBudget(), []);
  // once per app start (the warm-up renders with the data of the moment it runs)
  const latest = useRef({ ds, start, active });
  latest.current = { ds, start, active };
  useEffect(() => {
    if (!loaded) return;
    const { ds: data, start: s, active: a } = latest.current;
    if (!data || s === undefined || !a) return;
    return prefetchAnalyse(data, { start: s, active: a });
  }, [loaded]);

  // one object per value: a tab switch does not render the screens that read it again
  const month = useMemo(() => (start === undefined || !active ? null : { start, active }), [start, active]);

  // behind the splash: nothing to show yet
  if (setup === undefined || start === undefined || !active || !period) return null;
  if (setup) return <SetupDialog />;

  return (
    <ActiveMonthContext.Provider value={month!}>
      <ToastProvider>
        <div className="relative min-h-dvh lg:pl-[240px]">
          <Sidebar route={route} />
          <main
            className="pt-safe px-safe"
            style={{ paddingBottom: 'calc(var(--tabbar-space) + 16px)' }}
          >
            {!ds ? (
              <Skeleton />
            ) : (
              NAV.filter(({ route: r }) => visited.current.has(r)).map(({ route: r }) => (
                <TabVisibleContext.Provider key={r} value={r === route}>
                  <TabScreen tab={r} ds={ds} period={period} onPeriodChange={setPeriod} />
                </TabVisibleContext.Provider>
              ))
            )}
          </main>
          <TabBar route={route} />
        </div>
      </ToastProvider>
    </ActiveMonthContext.Provider>
  );
}
