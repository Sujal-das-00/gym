import { DEFAULT_SETTINGS } from "./constants.js";

export function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

export function normalizeTheme(theme = {}, defaults = DEFAULT_SETTINGS.theme) {
  return {
    primary: isHexColor(theme.primary) ? theme.primary : defaults.primary || "#11784a",
    primaryDark: isHexColor(theme.primaryDark) ? theme.primaryDark : defaults.primaryDark || "#073f2d",
    accent: isHexColor(theme.accent) ? theme.accent : defaults.accent || "#4f46e5",
    danger: isHexColor(theme.danger) ? theme.danger : defaults.danger || "#c43d32",
    background: isHexColor(theme.background) ? theme.background : defaults.background || "#f6f8f5",
    panel: isHexColor(theme.panel) ? theme.panel : defaults.panel || "#ffffff",
    text: isHexColor(theme.text) ? theme.text : defaults.text || "#17201b",
  };
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function mixHex(hex, mix = "#ffffff", amount = 0.88) {
  const base = hexToRgb(hex);
  const target = hexToRgb(mix);
  const channel = (key) => Math.round(base[key] * (1 - amount) + target[key] * amount);
  return `rgb(${channel("r")}, ${channel("g")}, ${channel("b")})`;
}

// Writes the palette onto :root as CSS custom properties — style.css reads them,
// so the whole UI recolours without touching a single class name.
export function applyTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty("--bg", theme.background);
  root.style.setProperty("--panel", theme.panel);
  root.style.setProperty("--ink", theme.text);
  root.style.setProperty("--green", theme.primary);
  root.style.setProperty("--green-dark", theme.primaryDark);
  root.style.setProperty("--green-deep", mixHex(theme.primaryDark, "#000000", 0.28));
  root.style.setProperty("--green-soft", mixHex(theme.primary));
  root.style.setProperty("--blue", theme.accent);
  root.style.setProperty("--blue-soft", mixHex(theme.accent));
  root.style.setProperty("--red", theme.danger);
  root.style.setProperty("--red-soft", mixHex(theme.danger));
}
