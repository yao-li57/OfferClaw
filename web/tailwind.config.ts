import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#6366f1', dark: '#4f46e5' },
        surface: { DEFAULT: '#1e1e2e', light: '#2a2a3e' },
      },
    },
  },
  plugins: [],
};

export default config;
