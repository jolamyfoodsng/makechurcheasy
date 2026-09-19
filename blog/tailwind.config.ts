import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1D4ED8",
          hover: "#2563EB",
          pressed: "#1E40AF",
        },
        slate: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1F2937",
          900: "#111827",
          950: "#0F172A",
        },
        neutral: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#CBD5E1",
          600: "#334155",
          800: "#1F2937",
          900: "#0F172A",
        },
        blue: {
          400: "#93C5FD",
          500: "#60A5FA",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
        },
        orange: "#F97316",
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
      },
      spacing: {
        28: "7rem",
      },
      letterSpacing: {
        tighter: "-.04em",
      },
      fontSize: {
        "5xl": "2.5rem",
        "6xl": "2.75rem",
        "7xl": "4.5rem",
        "8xl": "6.25rem",
      },
    },
  },
  plugins: [],
};
export default config;
