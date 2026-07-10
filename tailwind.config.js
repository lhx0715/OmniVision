/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      fontFamily: {
        mono: ['"Geist Mono"', '"Cascadia Code"', "Consolas", "monospace"],
        sans: ['"Geist Variable"', "system-ui", "sans-serif"],
      },
      colors: {
        dossier: {
          bg: "#09090b",
          surface: "#18181b",
          border: "#27272a",
        },
      },
      animation: {
        "breathe": "breathe 3s ease-in-out infinite",
        "fade-in-up": "fadeInUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards",
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "shimmer-sweep": "shimmerSweep 1.8s ease-in-out infinite",
        "scan-sweep": "scanSweep 5s linear infinite",
        "cursor-blink": "cursorBlink 1s ease-in-out infinite",
        "pulse-ring": "pulseRing 2s ease-out infinite",
        "bar-grow": "barGrow 0.8s cubic-bezier(0.22,1,0.36,1) forwards",
        "float-up": "floatUp 0.5s ease-out forwards",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(16,185,129,0.12), 0 0 60px rgba(16,185,129,0.04)" },
          "50%": { boxShadow: "0 0 28px rgba(16,185,129,0.28), 0 0 80px rgba(16,185,129,0.08)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(16px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        shimmerSweep: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        scanSweep: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(2000%)" },
        },
        cursorBlink: {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "1" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.8)", opacity: "1" },
          "100%": { transform: "scale(2)", opacity: "0" },
        },
        barGrow: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        floatUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
