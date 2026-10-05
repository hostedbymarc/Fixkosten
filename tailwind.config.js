/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        canvas: '#FAFAFA',
        line: '#EDEDED',
        ink: { DEFAULT: '#18181B', soft: '#52525B', mute: '#71717A', faint: '#A1A1AA' },
        accent: { DEFAULT: '#5B5BD6', soft: '#EEEEFB', strong: '#4747C2' },
        paid: { DEFAULT: '#16A34A', soft: '#E8F6EC' },
        warn: { DEFAULT: '#B45309', soft: '#FEF3E2' },
        over: { DEFAULT: '#DC2626', soft: '#FDECEC' },
      },
      borderRadius: { card: '18px' },
      boxShadow: {
        card: '0 1px 2px rgba(16,16,24,0.04), 0 4px 16px rgba(16,16,24,0.04)',
        sheet: '0 -8px 40px rgba(16,16,24,0.12)',
      },
    },
  },
  plugins: [],
};
