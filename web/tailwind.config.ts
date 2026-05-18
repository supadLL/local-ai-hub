import type { Config } from "tailwindcss";

export default {
  content: ["./web/index.html", "./web/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f5f7f8",
        ink: "#17211d",
        muted: "#66736e",
        hub: {
          50: "#edf9f4",
          100: "#d5f0e6",
          500: "#14735b",
          600: "#0f5f4c",
          900: "#17211d"
        },
        signal: {
          blue: "#2d6fc7",
          amber: "#a86913",
          red: "#b94225"
        }
      },
      boxShadow: {
        panel: "0 18px 48px rgba(27, 42, 36, 0.08)"
      },
      fontFamily: {
        sans: ["Aptos", "Segoe UI Variable Text", "Microsoft YaHei UI", "sans-serif"],
        mono: ["Cascadia Mono", "Consolas", "SFMono-Regular", "monospace"]
      },
      borderRadius: {
        control: "8px"
      }
    }
  },
  plugins: []
} satisfies Config;
