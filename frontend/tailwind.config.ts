import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // FORGEAI design system (from the design prototype)
        forge: {
          bg: "#05070d", // page background
          panel: "#0a0f1a", // raised surfaces
          blue: "#12a3ff", // primary accent
          ice: "#7fd0ff", // selected / active text
          steel: "#8ba4c2", // muted body text
          bright: "#eef6ff", // headings
          amber: "#ffc46a", // secondary accent
        },
      },
      borderColor: {
        line: "rgba(60, 120, 190, 0.25)", // hairline borders
      },
      backgroundColor: {
        tint: "rgba(18, 163, 255, 0.04)", // faint blue fill
        "tint-strong": "rgba(18, 163, 255, 0.15)", // selected fill
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        forge: "2px", // sharp corners everywhere
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
