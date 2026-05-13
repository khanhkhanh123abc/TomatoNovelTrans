import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        reader: ['Noto Serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
