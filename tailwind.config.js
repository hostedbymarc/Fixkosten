/** @type {import('tailwindcss').Config} */

// Colours are CSS variables (RGB channels) so light, dark and "System" switch
// without touching components. Values live in src/index.css.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', 'Geist', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        canvas: v('canvas'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2') },
        raised: v('raised'),
        line: v('line'),
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), mute: v('ink-mute'), faint: v('ink-faint') },
        // accent = filled surfaces (white text on top), accent-ink = text, borders, rings
        accent: {
          DEFAULT: v('accent'),
          hover: v('accent-hover'),
          ink: v('accent-ink'),
          soft: v('accent-soft'),
          'soft-hover': v('accent-soft-hover'),
          strong: v('accent-strong'),
        },
        paid: { DEFAULT: v('paid'), soft: v('paid-soft'), on: v('on-paid') },
        warn: { DEFAULT: v('warn'), soft: v('warn-soft') },
        over: { DEFAULT: v('over'), soft: v('over-soft') },
        danger: { DEFAULT: v('danger'), hover: v('danger-hover') },
        zinc: {
          50: v('zinc-50'),
          100: v('zinc-100'),
          200: v('zinc-200'),
          300: v('zinc-300'),
          900: v('zinc-900'),
        },
      },
      borderRadius: { card: '22px' },
      boxShadow: {
        card: 'var(--shadow-card)',
        sheet: 'var(--shadow-sheet)',
        glow: 'var(--shadow-glow)',
      },
    },
  },
  plugins: [],
};
