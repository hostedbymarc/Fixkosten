import { lazy, Suspense, useEffect, useState } from 'react';
import { db } from '../../db/db';
import { markWalkthroughSeen } from '../../db/kontoActions';
import { closePopover } from '../../lib/popoverBus';
import type { Dataset, Period } from '../../lib/types';
import { onOpenWalkthrough } from '../../lib/walkthroughBus';

const WalkthroughSheet = lazy(() => import('./WalkthroughSheet'));

/** The one place the walkthrough lives: opened via openWalkthrough(); marks it seen when it opens. */
export function WalkthroughHost({ ds, active }: { ds: Dataset; active: Period }) {
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      onOpenWalkthrough(() => {
        closePopover();
        setOpen(true);
        void markWalkthroughSeen(db);
      }),
    [],
  );
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <WalkthroughSheet ds={ds} active={active} onClose={() => setOpen(false)} />
    </Suspense>
  );
}
