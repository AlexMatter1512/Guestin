import { createFileRoute } from "@tanstack/react-router";
import { SiteShell, repo } from "@/components/SiteShell";
import { useI18n } from "@/i18n/LanguageContext";
export const Route = createFileRoute("/docs/airbnb")({ component: Guide });
function Guide() {
  const { lang } = useI18n();
  return (
    <SiteShell>
      <main className="site-section">
        <a href="/docs">← Integrations / Integrazioni</a>
        <h1>Airbnb · iCal</h1>
        <p className="lead">
          {lang === "it"
            ? "Carica o recupera un calendario iCal, seleziona un evento e associalo a una porta. Controlla la bozza: l’importazione non crea codici automaticamente."
            : "Upload or fetch an iCal calendar, select an event and map it to a door. Review the draft; calendar import does not automatically create access codes."}
        </p>
        <a href={repo + "/blob/main/docs/REFERENCE.md"}>Documentation ↗</a>
      </main>
    </SiteShell>
  );
}
