// polster-ziel: „Dein Polster“ opens from the Polster card of the month, from „Dein Plan“ („ändern ›“) and from
// the settings; they call openPolster(), the one host (src/components/konto/Polster.tsx) shows the sheet.
export interface OpenPolster {
  /** focus goes back here when the sheet closes */
  returnFocusTo?: HTMLElement | null;
}

type Listener = (open: OpenPolster) => void;
const listeners = new Set<Listener>();

export function openPolster(open: OpenPolster = {}): void {
  for (const l of listeners) l(open);
}

export function onOpenPolster(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
