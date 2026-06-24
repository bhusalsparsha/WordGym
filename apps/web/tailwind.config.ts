import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#121211',
        primary: '#d97706',
        secondary: '#f5f5f3',
        success: '#22c55e',
        error: '#ef4444',
      },
      boxShadow: {
        glow: '0 1px 3px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.3)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['var(--font-baskerville)', 'Libre Baskerville', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
