import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          500: "#1E40AF",
          600: "#1E3A8A",
        },
        background: "#F9FAFB",
        foreground: "#111827",
        muted: "#6B7280",
        border: "#E5E7EB",
        success: "#16A34A",
        warning: "#D97706",
        error: "#DC2626",
      },
      fontFamily: {
        sans: [
          "var(--font-noto-sans-kr)",
          "var(--font-inter)",
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        caption: ["12px", { lineHeight: "1.5" }],
      },
    },
  },
  plugins: [],
};

export default config;
