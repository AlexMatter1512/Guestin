import { sitePath } from "@/lib/site-path";
import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";
import { useI18n } from "@/i18n/LanguageContext";
export const Route = createFileRoute("/docs/")({ component: Docs });
function Docs() {
  const { lang } = useI18n();
  return (
    <SiteShell>
      <main className="site-section">
        <h1>{lang === "it" ? "Integrazioni" : "Integrations"}</h1>
        <p>
          {lang === "it"
            ? "Tutti i connettori sono opzionali. Le importazioni preparano bozze da controllare prima del salvataggio."
            : "Every connector is optional. Imports prepare drafts for you to review before saving."}
        </p>
        {[
          [
            "IoT",
            [
              ["ewelink", "eWeLink"],
              ["shelly", "Shelly Cloud"],
              ["home-assistant", "Home Assistant"],
              ["webhooks", "HTTP webhooks"],
            ],
          ],
          [
            lang === "it" ? "Prenotazioni" : "Reservations",
            [
              ["krossbooking", "KrossBooking"],
              ["airbnb", "Airbnb · iCal"],
              ["booking-com", "Booking.com · iCal"],
              ["gemini", "Gemini"],
            ],
          ],
        ].map(([title, items]) => (
          <section key={title as string} className="mt-12">
            <h2>{title as string}</h2>
            <div className="feature-grid">
              {(items as string[][]).map(([slug, name]) => (
                <a
                  key={slug}
                  className="block rounded-xl border p-6"
                  href={sitePath("/docs/" + slug)}
                >
                  {name} →
                </a>
              ))}
            </div>
          </section>
        ))}
      </main>
    </SiteShell>
  );
}
