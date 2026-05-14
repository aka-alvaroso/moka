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
          0: '#0d0d0f',
          1: '#141416',
          2: '#1c1c1f',
          3: '#242428',
          4: '#2c2c31',
        },
        border: '#2e2e33',
        accent: '#6366f1',
        'accent-hover': '#818cf8',
      },
    },
  },
  plugins: [],
};
