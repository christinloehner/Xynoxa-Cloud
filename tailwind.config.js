/*
 * Copyright (C) 2025 Christin Löhner
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/lib/**/*.{js,ts,jsx,tsx}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        'xynoxa-cyan': '#00F2FF',
        'xynoxa-black': '#0A0A0A',
        'xynoxa-surface': '#1A1A1A',
        'xynoxa-text': '#F5F5F5',
        'xynoxa-text-muted': '#888888',
        'deep-space-blue': '#0E1A2B',
        'aurora-mint': '#45E6C5',
        'nebula-pink': '#E056B5',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    }
  },
  plugins: []
};
