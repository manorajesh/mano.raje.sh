/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ["Anonymous Pro", "sans-serif"],
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
      scale: {
        102: "1.02",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
