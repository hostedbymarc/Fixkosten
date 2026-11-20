// „Dein Plan“ opens from several places (① and the pill of „Dein Monat“, „Nächster großer Monat“, the
// settings, right after the setup): they call openPlan(); the one host (src/components/konto/PlanHost.tsx)
// shows the sheet.
export interface OpenPlan {
  /** the pill: the Spielgeld opens editable */
  editSpielgeld?: boolean;
  /** right after the setup: the recommended plan is taken as the plan */
  fromSetup?: boolean;
  /** focus goes back here when the sheet closes */
  returnFocusTo?: HTMLElement | null;
}

type Listener = (open: OpenPlan) => void;
const listeners = new Set<Listener>();

export function openPlan(open: OpenPlan = {}): void {
  for (const l of listeners) l(open);
}

export function onOpenPlan(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
