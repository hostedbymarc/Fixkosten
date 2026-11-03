// Dev-only page /dev/peas/ (dev/peas/index.html is not part of the production build): every <Pea>
// size × colour × state, the open check, the FAB and the logo – light and dark side by side (two
// frames of this page with ?theme=…). ?icon=<px>[&bleed=1] renders only the logo for
// scripts/make-icons.mjs.
import '@fontsource-variable/inter';
import '../index.css';
import { createRoot } from 'react-dom/client';
import { Logo } from '../components/Logo';
import { Pea, PeaOpen, type PeaState } from '../components/Pea';
import { CATEGORY_SLOTS } from '../lib/categoryColors';

const params = new URLSearchParams(location.search);
const theme = params.get('theme');
if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);

const SIZES = [12, 16, 22, 28, 40, 56, 96];
const COLOURS: { name: string; c: string }[] = [
  { name: 'Brand', c: 'rgb(var(--brand-500))' },
  { name: 'brand-300', c: 'rgb(var(--brand-300))' },
  ...CATEGORY_SLOTS.map((s) => ({ name: s.name, c: s.color })),
  { name: 'Logo', c: 'var(--pea-logo)' },
];
const STATES: PeaState[] = ['default', 'checked', 'pressed'];

function Icon({ size, bleed }: { size: number; bleed: boolean }) {
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  return (
    <div style={{ width: size, height: size }} data-testid="icon-root">
      <style>{'body::before, body::after, #root::before { display: none !important; }'}</style>
      <Logo size={size} bleed={bleed} icon />
    </div>
  );
}

function Sheet() {
  return (
    <div className="min-h-screen p-6 text-ink" style={{ background: 'var(--mesh-base)' }}>
      <h1 className="mb-4 text-[20px] font-semibold">Pea-Material · {theme === 'dark' ? 'Dunkel' : 'Hell'}</h1>
      {STATES.map((state) => (
        <section key={state} className="mb-6">
          <h2 className="section-title mb-2">Zustand: {state}</h2>
          <table className="border-separate border-spacing-x-3 border-spacing-y-2">
            <tbody>
              {COLOURS.map(({ name, c }) => (
                <tr key={name}>
                  <td className="pr-2 text-[12px] text-ink-mute">{name}</td>
                  {SIZES.map((s) => (
                    <td key={s} className="text-center align-middle">
                      <Pea size={s} color={state === 'checked' ? undefined : c} state={state} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td />
                {SIZES.map((s) => (
                  <td key={s} className="text-center text-[11px] text-ink-faint">
                    {s} px
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>
      ))}
      <section className="mb-6">
        <h2 className="section-title mb-2">Haken offen · FAB · Logo</h2>
        <div className="flex flex-wrap items-center gap-5">
          <PeaOpen size={28} />
          <PeaOpen size={22} />
          <button type="button" className="rounded-full" aria-label="FAB">
            <Pea size={56} pressable>
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" style={{ stroke: 'var(--check-ink)' }} strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            </Pea>
          </button>
          {[16, 28, 44, 96, 180].map((s) => (
            <Logo key={s} size={s} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Both() {
  return (
    <div className="grid min-h-screen grid-cols-1 xl:grid-cols-2">
      <iframe title="Hell" src="?theme=light" className="h-[1500px] w-full border-0" />
      <iframe title="Dunkel" src="?theme=dark" className="h-[1500px] w-full border-0" />
    </div>
  );
}

const icon = params.get('icon');
createRoot(document.getElementById('root')!).render(
  icon ? <Icon size={Number(icon)} bleed={params.get('bleed') === '1'} /> : theme ? <Sheet /> : <Both />,
);
