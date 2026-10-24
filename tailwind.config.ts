import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          600: "#1d5fbf",
          700: "#174c99",
          800: "#123b77",
        },
      },
    },
  },
  plugins: [],
};

export default config;
