import containerQueries from "@tailwindcss/container-queries";
import forms from "@tailwindcss/forms";

/**
 * Design tokens from the member-app template. The `primary` family reads CSS
 * variables instead of literals so each gym's saved brand colour can re-tint the
 * page at runtime (see src/lib/theme.js); the channels are stored space-separated
 * so Tailwind's opacity modifiers (`bg-primary/20`) keep working.
 */
const brand = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: brand("--brand-primary"),
        "primary-container": brand("--brand-primary"),
        "primary-hover": brand("--brand-primary-hover"),
        "primary-tint": brand("--brand-primary-tint"),
        "on-primary": "#ffffff",
        "on-primary-container": "#ffffff",
        // Muted brand pair used for quiet badges ("Paid", plan chips) where the
        // full-strength primary would shout.
        "primary-fixed": brand("--brand-primary-fixed"),
        "on-primary-fixed": brand("--brand-on-primary-fixed"),
        background: "#fbf8ff",
        surface: "#ffffff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f9fafb",
        "surface-container": "#f3f4f6",
        "surface-container-high": "#eae7ee",
        "surface-container-highest": "#e4e1e8",
        "on-surface": "#111827",
        "on-surface-variant": "#4b5563",
        secondary: "#64748b",
        outline: "#8d7165",
        "outline-variant": "#e5e7eb",
        tertiary: "#059669",
        "tertiary-container": "#ecfdf5",
        "on-tertiary": "#ffffff",
        "on-tertiary-container": "#065f46",
      },
      boxShadow: {
        // Barely-there card lift used across the member home screen.
        xs: "0 1px 2px rgba(17, 24, 39, 0.05)",
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        full: "9999px",
      },
      spacing: {
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "1rem",
        "space-lg": "1.5rem",
        "space-xl": "2rem",
        gutter: "1rem",
        margin: "1.25rem",
      },
      fontFamily: {
        "headline-lg": ["Space Grotesk", "sans-serif"],
        "headline-md": ["Space Grotesk", "sans-serif"],
        "headline-sm": ["Space Grotesk", "sans-serif"],
        "body-lg": ["Inter", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "body-sm": ["Inter", "sans-serif"],
        "label-lg": ["Inter", "sans-serif"],
        "label-md": ["Inter", "sans-serif"],
        "label-sm": ["Inter", "sans-serif"],
      },
      fontSize: {
        "headline-lg": ["28px", { lineHeight: "34px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-md": ["22px", { lineHeight: "28px", letterSpacing: "-0.015em", fontWeight: "600" }],
        "headline-sm": ["18px", { lineHeight: "24px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "24px", letterSpacing: "-0.005em", fontWeight: "400" }],
        "body-md": ["14px", { lineHeight: "20px", letterSpacing: "0em", fontWeight: "400" }],
        "body-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.005em", fontWeight: "400" }],
        "label-lg": ["14px", { lineHeight: "20px", letterSpacing: "0.01em", fontWeight: "600" }],
        "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "600" }],
        "label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.04em", fontWeight: "600" }],
      },
      keyframes: {
        scanline: {
          "0%": { top: "12%", opacity: "0.8" },
          "50%": { top: "86%", opacity: "1" },
          "100%": { top: "12%", opacity: "0.8" },
        },
        "panel-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        scanline: "scanline 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "panel-in": "panel-in 220ms cubic-bezier(0.2, 0, 0, 1) both",
      },
    },
  },
  plugins: [forms, containerQueries],
};
