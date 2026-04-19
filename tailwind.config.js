/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0b0f1a',
          800: '#111827',
          700: '#1a2332',
          600: '#1e293b',
          500: '#243044',
          400: '#334155',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent, 217 91% 59%) / <alpha-value>)',
          hover: 'hsl(var(--accent-hover, 217 91% 50%) / <alpha-value>)',
          light: 'hsl(var(--accent-light, 217 91% 68%) / <alpha-value>)',
          dark: 'hsl(var(--accent-dark, 217 91% 45%) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
