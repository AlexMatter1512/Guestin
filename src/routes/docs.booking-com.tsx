import { createFileRoute } from "@tanstack/react-router";
import { SiteShell, repo } from "@/components/SiteShell";
import { useI18n } from "@/i18n/LanguageContext";
export const Route = createFileRoute("/docs/booking-com")({ component: Guide });
function Guide() {
  const { lang } = useI18n();
  return (
    <SiteShell>
      <main className="site-section">
        <a href="/docs">← Integrations / Integrazioni</a>
        <h1>Booking.com · iCal</h1>
        <p className="lead">
          {lang === "it"
            ? "Usa un’esportazione iCal disponibile per preparare una bozza. Associa la porta e controlla le date. È un’importazione calendario, non un connettore API diretto."
            : "Use an available iCal export to prepare a draft, map its door and review dates before saving. This is calendar import, not a direct Booking.com API connector."}
        </p>
        <a href={repo + "/blob/main/docs/REFERENCE.md"}>Documentation ↗</a>
      </main>
    </SiteShell>
  );
}
