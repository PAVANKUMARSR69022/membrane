/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          bg: "#111215",
          surface: "#16171b",
          card: "#1c1e24",
          panel: "#22252d",
          border: "#2e323b",
          borderBright: "#3a3f4b",
          textPrimary: "#e6e8eb",
          textSecondary: "#8c929e",
          textMuted: "#555c6b",
          accentAmber: "#f59e0b",
          accentOrange: "#d97706",
          accentGreen: "#10b981",
          accentRed: "#ef4444",
          accentSlate: "#64748b",
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}
