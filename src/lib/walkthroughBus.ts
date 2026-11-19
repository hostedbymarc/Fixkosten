// „So funktioniert Erbse“ opens from three places (settings row, the tile's ⓘ, right after the setup):
// they call openWalkthrough(); the one host (src/components/konto/WalkthroughHost.tsx) shows the sheet.
type Listener = () => void;
const listeners = new Set<Listener>();

export function openWalkthrough(): void {
  for (const l of listeners) l();
}

export function onOpenWalkthrough(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
