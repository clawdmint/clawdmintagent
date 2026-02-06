import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
          950: "#082f49",
        },
        accent: {
          50: "#fdf4ff",
          100: "#fae8ff",
          200: "#f5d0fe",
          300: "#f0abfc",
          400: "#e879f9",
          500: "#d946ef",
          600: "#c026d3",
          700: "#a21caf",
          800: "#86198f",
          900: "#701a75",
          950: "#4a044e",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      letterSpacing: {
        "tightest": "-0.04em",
        "tighter-2": "-0.03em",
        "tight-1": "-0.02em",
        "tight-05": "-0.01em",
      },
      fontSize: {
        "display-xl": ["5rem", { lineHeight: "1", letterSpacing: "-0.04em", fontWeight: "800" }],
        "display-lg": ["3.75rem", { lineHeight: "1.05", letterSpacing: "-0.035em", fontWeight: "800" }],
        "display": ["3rem", { lineHeight: "1.1", letterSpacing: "-0.03em", fontWeight: "700" }],
        "heading-xl": ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.025em", fontWeight: "700" }],
        "heading-lg": ["1.875rem", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        "heading": ["1.5rem", { lineHeight: "1.25", letterSpacing: "-0.02em", fontWeight: "600" }],
        "heading-sm": ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.015em", fontWeight: "600" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6", letterSpacing: "-0.01em" }],
        "body": ["1rem", { lineHeight: "1.6", letterSpacing: "-0.005em" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5", letterSpacing: "0em" }],
        "caption": ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.01em" }],
        "overline": ["0.6875rem", { lineHeight: "1.2", letterSpacing: "0.08em", fontWeight: "600" }],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "gradient": "gradient 8s ease infinite",
        "float": "float-3d 6s ease-in-out infinite",
      },
      keyframes: {
        gradient: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "float-3d": {
          "0%, 100%": { transform: "translateY(0) rotateX(0deg) rotateY(0deg)" },
          "25%": { transform: "translateY(-8px) rotateX(2deg) rotateY(-2deg)" },
          "50%": { transform: "translateY(-14px) rotateX(-1deg) rotateY(2deg)" },
          "75%": { transform: "translateY(-6px) rotateX(1deg) rotateY(-1deg)" },
        },
      },
      backgroundSize: {
        "300%": "300%",
      },
    },
  },
  plugins: [],
};

export default config;
