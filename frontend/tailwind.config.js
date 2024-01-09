/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ["Inter", "sans-serif"],
      serif: ["Libre Baskerville", "serif"],
      mono: ["Menlo", "monospace"],
    },
    extend: {
      colors: {
        "dark-blue": "#181e2b",
      },
    },
  },
  plugins: [],
};
