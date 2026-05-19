import type { Config } from "tailwindcss";

export default {
  content: ["./web/index.html", "./web/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6faf8",
        surface: "#ffffff",
        mist: "#eef8f4",
        ink: "#10201a",
        muted: "#62736b",
        line: "#dce8e3",
        hub: {
          50: "#edf9f4",
          100: "#d6f3e8",
          200: "#a8e3d0",
          500: "#31a57f",
          600: "#1e8c78",
          700: "#146f61",
          900: "#10201a"
        },
        signal: {
          blue: "#4c8bdc",
          amber: "#c78725",
          red: "#c95846"
        }
      },
      boxShadow: {
        panel: "0 22px 54px rgba(32, 64, 52, 0.1)",
        lift: "0 12px 26px rgba(29, 75, 60, 0.12)"
      },
      fontFamily: {
        sans: ["Aptos", "HarmonyOS Sans SC", "Microsoft YaHei UI", "Segoe UI Variable Text", "sans-serif"],
        display: ["Aptos Display", "Aptos", "HarmonyOS Sans SC", "Microsoft YaHei UI", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Mono", "Consolas", "SFMono-Regular", "monospace"]
      },
      borderRadius: {
        control: "8px"
      }
    }
  },
  plugins: []
} satisfies Config;
