// Tiny theme controller. Persists to localStorage and respects system preference.
export type Theme = "light" | "dark" | "system";
const KEY = "kenzo-theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem(KEY) as Theme) || "system";
}
export function resolveTheme(t: Theme): "light" | "dark" {
  if (t !== "system") return t;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(t);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = resolved;
}
export function setTheme(t: Theme) {
  localStorage.setItem(KEY, t);
  applyTheme(t);
}
export function initTheme() {
  applyTheme(getStoredTheme());
  if (typeof window !== "undefined") {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getStoredTheme() === "system") applyTheme("system");
    });
  }
}
