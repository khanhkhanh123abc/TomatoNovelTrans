/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        reader: ['"Noto Serif"', '"Source Han Serif"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
