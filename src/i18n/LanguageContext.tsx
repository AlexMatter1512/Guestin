import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { translations, type Lang, type Translation } from "./translations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Menu } from "lucide-react";
import guestinIcon from "@/assets/guestin-icon.png";
import { Link } from "@tanstack/react-router";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: Translation };

const LanguageContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "guestin.lang";

function detectInitial(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (stored === "en" || stored === "it") return stored;
  const nav = window.navigator.language?.toLowerCase() ?? "";
  return nav.startsWith("it") ? "it" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const initial = detectInitial();
    setLangState(initial);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang] as Translation }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const base = "px-2 py-1 text-xs font-medium uppercase tracking-wider transition rounded-md";
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 ${className}`}>
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`${base} ${lang === "en" ? "bg-ink text-paper" : "text-muted-foreground hover:text-ink"}`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("it")}
        aria-pressed={lang === "it"}
        className={`${base} ${lang === "it" ? "bg-ink text-paper" : "text-muted-foreground hover:text-ink"}`}
      >
        IT
      </button>
    </div>
  );
}

export function BrandMenu({ sections = [] }: { sections?: { href: string; label: string }[] }) {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink outline-none transition hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-ink/30 sm:hidden"
        >
          <Menu className="h-5 w-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[12rem]">
        {sections.map((s) => (
          <DropdownMenuItem key={s.href} asChild>
            <a href={s.href}>{s.label}</a>
          </DropdownMenuItem>
        ))}
        {sections.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Language
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setLang("en")} className="flex items-center justify-between">
          English
          {lang === "en" && <Check className="h-4 w-4 text-bronze" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLang("it")} className="flex items-center justify-between">
          Italiano
          {lang === "it" && <Check className="h-4 w-4 text-bronze" />}
        </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Link
        to="/"
        aria-label="GuestIn home"
        className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
      >
        <img
          src={guestinIcon}
          alt="GuestIn"
          width={32}
          height={32}
          className="hidden h-8 w-8 rounded-md object-contain sm:block"
        />
        <span className="font-display text-xl font-semibold tracking-tight text-ink">GuestIn</span>
      </Link>
    </div>
  );
}