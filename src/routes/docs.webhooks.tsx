import { sitePath } from "@/lib/site-path";
import { createFileRoute } from "@tanstack/react-router";
import { SiteShell, repo } from "@/components/SiteShell";
import { useI18n } from "@/i18n/LanguageContext";
export const Route = createFileRoute("/docs/webhooks")({ component: Guide });
function Guide() {
  const { lang } = useI18n();
  return (
    <SiteShell>
      <main className="site-section">
        <a href={sitePath("/docs")}>← Integrations / Integrazioni</a>
        <h1>HTTP webhooks</h1>
        <p className="lead">
          {lang === "it"
            ? "Imposta endpoint, metodo, header e parametri in Porte. L’accettazione della richiesta non conferma l’apertura fisica."
            : "Set the endpoint, method, headers and query parameters in Doors. Provider acceptance does not confirm physical opening."}
        </p>
        <a href={repo + "/blob/main/docs/REFERENCE.md"}>Documentation ↗</a>
      </main>
    </SiteShell>
  );
}
