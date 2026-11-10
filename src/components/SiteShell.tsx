import { sitePath } from "@/lib/site-path";
import { Github } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useI18n } from "@/i18n/LanguageContext";
export const repo = "https://github.com/AlexMatter1512/guestin";
export function SiteShell({ children }: { children: React.ReactNode }) {
  const { lang, setLang } = useI18n();
  const it = lang === "it";
  return (
    <>
      <header className="site-nav">
        <a className="font-display text-2xl" href={sitePath("/")}>
          Guestin
        </a>
        <nav>
          <a href={sitePath("/#features")}>{it ? "Funzionalità" : "Features"}</a>
          <a href={sitePath("/docs")}>{it ? "Integrazioni" : "Integrations"}</a>
          <a href={sitePath("/get-started")}>{it ? "Inizia" : "Get started"}</a>
          <a href={repo} className="github-link" aria-label="GitHub" title="GitHub">
            <Github size={21} aria-hidden="true" />
          </a>
          <ThemeToggle />
          <button onClick={() => setLang(it ? "en" : "it")}>{it ? "EN" : "IT"}</button>
        </nav>
      </header>
      {children}
      <footer className="site-section">
        <strong>Guestin</strong>
        <p>{it ? "Accesso ospiti. Sul tuo server." : "Guest access. On your server."}</p>
        <a href={repo} className="github-link" aria-label="GitHub" title="GitHub">
          <Github size={21} aria-hidden="true" />
        </a>{" "}
        · <a href={repo + "/blob/main/CONTRIBUTING.md"}>{it ? "Contribuisci" : "Contribute"}</a> ·{" "}
        <a href={sitePath("/get-started")}>{it ? "Inizia" : "Get started"}</a>
      </footer>
    </>
  );
}
