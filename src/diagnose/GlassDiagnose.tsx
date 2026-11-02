import { useState } from 'react';
import { applyTheme } from '../lib/theme';
import './glass-diagnose.css';

/**
 * Diagnose-Seite /#diagnose-glas: acht Varianten des Glas-Materials untereinander über dem echten
 * App-Hintergrund (Nebel + Körnung), um zu sehen, welche iOS „Ganze Seite“ sauber aufnimmt.
 * Nur im Deploy-Preview-Build (vite.config.ts: __GLASS_DIAGNOSE__), nicht verlinkt.
 */
const VARIANTS: { n: number; text: string }[] = [
  { n: 1, text: 'Grundfläche wie aktuell, ohne backdrop-filter.' },
  { n: 2, text: 'Grundfläche + backdrop-filter: blur(20px) saturate(160%) – Werte vor Liquid Glass.' },
  { n: 3, text: 'Grundfläche + backdrop-filter: blur(24px) saturate(180%) – aktuell.' },
  { n: 4, text: 'Wie 3 + Glanzpunkt als radial-gradient im Hintergrund.' },
  { n: 5, text: 'Wie 3 + Rand + Inset-Schatten (neue Lichtkante).' },
  { n: 6, text: 'Wie 3, aber Grundfläche deckend (.92).' },
  { n: 7, text: 'Wie 4, aber ohne backdrop-filter.' },
  { n: 8, text: 'Exakt die Produktions-Klasse von main (9eb9938): Rand als ::before mit mask-composite, Glanzpunkt als ::after, Blur.' },
];

type Scheme = 'system' | 'light' | 'dark';

export function GlassDiagnose() {
  const [scheme, setScheme] = useState<Scheme>('system');
  const pick = (s: Scheme) => {
    // only for this page: the stored appearance of the app stays as it is
    applyTheme(s);
    setScheme(s);
  };
  return (
    <main className="mx-auto max-w-[560px] px-4 pb-16 pt-[calc(var(--safe-top)+16px)]" data-testid="glass-diagnose">
      <h1 className="text-[22px] font-semibold text-ink">Diagnose Glas</h1>
      <p className="mt-1 text-[14px] text-ink-mute">Acht Varianten über dem App-Hintergrund. Für iOS „Ganze Seite“ hell und dunkel aufnehmen.</p>
      <div className="diag-switch mt-4 inline-flex gap-1 rounded-full p-1" role="group" aria-label="Darstellung">
        {(
          [
            ['system', 'System'],
            ['light', 'Hell'],
            ['dark', 'Dunkel'],
          ] as const
        ).map(([s, label]) => (
          <button
            key={s}
            type="button"
            aria-pressed={scheme === s}
            onClick={() => pick(s)}
            className="focus-ring min-h-[40px] rounded-full px-4 text-[15px] font-medium text-ink"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-5">
        {VARIANTS.map(({ n, text }) => (
          <section key={n} className={`diag-card diag-v${n} p-5`} data-variant={n}>
            <div className="flex items-start gap-4">
              <span className="text-[44px] font-bold leading-none tabular-nums text-ink">{n}</span>
              <p className="pt-1 text-[14px] leading-snug text-ink-mute">{text}</p>
            </div>
            <div className="mt-5 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[16px] font-medium text-ink">Beispiel-Abo</div>
                <div className="text-[13px] text-ink-faint">monatlich · fällig am 15.</div>
              </div>
              <div className="shrink-0 text-[20px] font-semibold tabular-nums text-ink">€ 12,99</div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
