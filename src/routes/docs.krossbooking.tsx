import { createFileRoute } from "@tanstack/react-router";
import { SiteShell, repo } from "@/components/SiteShell";
import { useI18n } from "@/i18n/LanguageContext";
export const Route = createFileRoute("/docs/krossbooking")({ component: Guide });
function Guide() {
  const { lang } = useI18n();
  return (
    <SiteShell>
      <main className="site-section">
        <a href="/docs">← Integrations / Integrazioni</a>
        <h1>KrossBooking</h1>
        <p className="lead">
          {lang === "it"
            ? "Collega l’account, completa la verifica e scegli una prenotazione. Controlla la bozza prima di creare il codice."
            : "Connect your account, complete verification and select a reservation. Review the imported draft before creating an access code."}
        </p>
        <a href={repo + "/blob/main/docs/REFERENCE.md"}>Documentation ↗</a>
      </main>
    </SiteShell>
  );
}
