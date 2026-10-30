import { useEffect, useState } from 'react';

/** Data or a lazy screen faster than this: no skeleton at all, straight to the entrance. */
export const SKELETON_DELAY_MS = 80;

/**
 * Loading placeholder in the shape of the cards (no spinner): appears only when loading takes longer
 * than 80 ms, static (no shimmer), gone as soon as the screen is there – then the screen's entrance
 * plays. Screen readers hear „Lädt …“.
 */
export function Skeleton({ label = 'Lädt …' }: { label?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), SKELETON_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-8 lg:px-8" role="status" aria-busy="true" data-testid="skeleton" data-shown={shown || undefined}>
      <span className="sr-only">{label}</span>
      {shown && (
        <div aria-hidden="true">
          <div className="flex h-11 items-center py-3 lg:h-auto lg:py-6">
            <div className="h-6 w-40 rounded-lg bg-zinc-200/60" />
          </div>
          <div className="flex flex-col gap-3 md:gap-4">
            {[0, 1, 2].map((n) => (
              <div key={n} className="glass p-4" data-testid="skeleton-card">
                <div className="h-3 w-24 rounded-full bg-zinc-200/70" />
                <div className="mt-3 h-6 w-40 rounded-lg bg-zinc-200/70" />
                <div className="mt-6 h-24 rounded-lg bg-zinc-100/70" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
