/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ["Inter", "sans-serif"],
      serif: ["Libre Baskerville", "serif"],
      mono: ["Menlo", "monospace"],
      special: ["cursive"],
    },
    extend: {
      colors: {
        "dark-blue": "#181e2b",
      },
      backgroundImage: {
        "custom-gradient":
          "linear-gradient(46deg, rgb(53, 129, 184), rgba(244, 91, 105))",
      },
    },
  },
  plugins: [],
};
