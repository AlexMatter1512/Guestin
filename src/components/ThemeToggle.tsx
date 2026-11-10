import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/i18n/LanguageContext";
const key = "guestin.landing.theme";
export function ThemeToggle() {
  const { lang } = useI18n();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(key);
      } catch {}
      const next = saved === "dark" || (saved !== "light" && media.matches);
      document.documentElement.classList.toggle("dark", next);
      setDark(next);
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const label = lang === "it" ? "Tema scuro" : "Dark theme";
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={label}
      aria-pressed={dark}
      title={label}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem(key, next ? "dark" : "light");
        } catch {}
      }}
    >
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
