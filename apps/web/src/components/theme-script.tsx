// Theme bootstrap — runs before paint, in <head>.
// Reproduces Prism's boot behaviour exactly (spec §5.1). The storage key is kept
// identical on purpose: it makes browser-local state portable.
export const THEME_STORAGE_KEY = "crixet_light_mode_preference_v1";
export type ThemePreference = "light" | "dark" | "system";

export const themeInitScript: string = `(function(){
  const KEY = ${JSON.stringify(THEME_STORAGE_KEY)};
  function cookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : undefined;
  }
  const pref = localStorage.getItem(KEY) ?? cookie(KEY) ?? "dark";
  const isDark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const html = document.documentElement;
  html.classList.toggle("dark", isDark);
  html.dataset.theme = isDark ? "dark" : "light";
  html.dataset.themePreference = pref;
  html.style.colorScheme = isDark ? "dark" : "light";
})();`;