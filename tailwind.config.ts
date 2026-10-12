import type { Config } from 'tailwindcss';

export default {
  content: ['./src/ui/**/*.{html,ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#ecf8f2',
          100: '#d2efe0',
          500: '#2F9E6E',
          600: '#278a5f',
          700: '#1f6f4c',
        },
      },
      borderRadius: { xl: '12px' },
      boxShadow: {
        soft: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        pop: '0 8px 24px rgba(16,24,40,.12), 0 2px 6px rgba(16,24,40,.06)',
      },
    },
  },
  plugins: [],
} satisfies Config;
