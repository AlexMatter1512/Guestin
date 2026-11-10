import { createFileRoute } from "@tanstack/react-router";
import { SiteShell, repo } from "@/components/SiteShell";
import { useI18n } from "@/i18n/LanguageContext";
export const Route = createFileRoute("/docs/gemini")({ component: Guide });
function Guide() {
  const { lang } = useI18n();
  return (
    <SiteShell>
      <main className="site-section">
        <a href="/docs">← Integrations / Integrazioni</a>
        <h1>Gemini</h1>
        <p className="lead">
          {lang === "it"
            ? "Collega facoltativamente una chiave API Gemini per estrarre i dettagli da uno screenshot. Controlla i dati suggeriti e salva il codice finale."
            : "Optionally connect a Gemini API key to extract guest details from a screenshot. Review the suggested details and save the final access code yourself."}
        </p>
        <a href={repo + "/blob/main/docs/REFERENCE.md"}>Documentation ↗</a>
      </main>
    </SiteShell>
  );
}
