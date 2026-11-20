import { useEffect, useState } from 'react';
import { useKonto } from '../../db/useKonto';
import { onOpenPlan, type OpenPlan } from '../../lib/planBus';
import { closePopover } from '../../lib/popoverBus';
import type { Dataset, Period } from '../../lib/types';
import { DeinPlanSheet } from './DeinPlanSheet';

/** The one place „Dein Plan“ lives: opened via openPlan() (card, big month, settings, after the setup). */
export function PlanHost({ ds, active }: { ds: Dataset; active: Period }) {
  const { settings } = useKonto();
  const [open, setOpen] = useState<OpenPlan | null>(null);
  useEffect(
    () =>
      onOpenPlan((o) => {
        closePopover();
        setOpen(o);
      }),
    [],
  );
  if (!open || !settings.enabled || !settings.setupDone) return null;
  return (
    <DeinPlanSheet
      ds={ds}
      active={active}
      editSpielgeld={open.editSpielgeld}
      fromSetup={open.fromSetup}
      returnFocusTo={open.returnFocusTo}
      onClose={() => setOpen(null)}
    />
  );
}
