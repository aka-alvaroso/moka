/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          0: '#000000',
          1: '#111113',
          2: '#1a1a1d',
          3: '#222226',
          4: '#2a2a2f',
        },
        border: '#2e2e33',
        accent: '#6366f1',
        'accent-hover': '#818cf8',
      },
    },
  },
  plugins: [],
};
