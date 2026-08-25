import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        panel: "#121621",
        ink: "#e6e8ee",
        muted: "#8a90a2",
        accent: "#7c5cff",
      },
    },
  },
  plugins: [],
};
export default config;
