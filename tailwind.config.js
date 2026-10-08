/** @type {import('tailwindcss').Config} */

// All colour values live in src/styles/tokens.css; Tailwind only references them.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const c = (name) => v(`c-${name}`);

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50: v('brand-50'),
          100: v('brand-100'),
          200: v('brand-200'),
          300: v('brand-300'),
          400: v('brand-400'),
          500: v('brand-500'),
          600: v('brand-600'),
          700: v('brand-700'),
          900: v('brand-900'),
        },
        canvas: c('canvas'),
        surface: c('surface'),
        raised: c('raised'),
        field: 'var(--field)',
        line: 'var(--line)',
        edge: 'var(--edge)',
        scrim: 'var(--scrim)',
        ink: { DEFAULT: c('ink'), soft: c('ink-soft'), mute: c('ink-mute'), faint: c('ink-faint') },
        // accent = filled surfaces (white text on top), accent-ink = text, links, borders
        accent: {
          DEFAULT: c('accent'),
          hover: c('accent-hover'),
          ink: c('accent-ink'),
          soft: c('accent-soft'),
          'soft-hover': c('accent-soft-hover'),
          strong: c('accent-strong'),
        },
        focus: c('focus'),
        paid: { DEFAULT: c('paid'), soft: c('paid-soft'), ink: c('paid-ink'), on: c('on-paid') },
        'check-open': c('check-open'),
        warn: { DEFAULT: c('warn'), icon: c('warn-icon'), soft: c('warn-soft') },
        over: { DEFAULT: c('over'), soft: c('over-soft') },
        danger: { DEFAULT: c('danger'), hover: c('danger-hover') },
        zinc: {
          50: c('zinc-50'),
          100: c('zinc-100'),
          200: c('zinc-200'),
          300: c('zinc-300'),
          900: c('zinc-900'),
        },
      },
      borderRadius: { card: '20px', tile: '16px' },
      boxShadow: {
        card: 'var(--glass-shadow)',
        sheet: 'var(--shadow-sheet)',
      },
    },
  },
  plugins: [],
};
