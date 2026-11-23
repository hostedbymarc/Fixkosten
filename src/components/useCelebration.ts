import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { markCelebrated } from '../db/kontoActions';
import { useKonto } from '../db/useKonto';
import { celebrateLive, confettiState } from '../lib/celebration';
import { reducedMotion } from '../lib/entrance';
import type { Period } from '../lib/types';
import { useActiveMonth } from '../lib/useToday';

/** what the hero showed last (survives the remount of a swipe): ticking the last position celebrates live */
const heroLast: { period: Period; done: boolean } | { period: null; done: false } = { period: null, done: false };

/**
 * The confetti of „{Monat} erledigt“ (hero, or the bills row of „Dein Monat“): falls once, live, when the
 * last position of the active month is ticked; else the peas lie still.
 */
export function useCelebration(period: Period, allPaid: boolean) {
  const { settings } = useKonto();
  const celebrated = settings.celebratedMonths.includes(period);
  const active = useActiveMonth();
  const [run, setRun] = useState(0);
  useEffect(() => {
    const live = celebrateLive(heroLast.period === null ? null : heroLast, period, allPaid, celebrated, active);
    Object.assign(heroLast, { period, done: allPaid });
    if (live) {
      setRun((n) => n + 1);
      // once per month: remembered, a later 100 % only shows the peas lying
      void markCelebrated(db, period);
    } else if (!allPaid) setRun(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, allPaid]);
  // another month: no falling peas from before (they lie)
  const [runFor, setRunFor] = useState(period);
  if (runFor !== period) {
    setRunFor(period);
    setRun(0);
  }
  return { peas: confettiState(allPaid, run > 0, reducedMotion()), run };
}

