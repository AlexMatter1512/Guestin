import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";
import { useI18n } from "@/i18n/LanguageContext";
const guide = {
  title: "eWeLink Web webhooks",
  sources: [
    ["eWeLink: create and use webhooks", "https://ewelink.cc/how-to-create-use-ewelink-webhooks/"],
    [
      "eWeLink: webhook scenes",
      "https://ewelink.cc/ewelink-webhook-to-combine-ewelink-with-other-third-platform-apps/",
    ],
  ],
  en: [
    [
      "Before you start",
      "You need a working device and eWeLink Web access. eWeLink lists Web under its Advanced plan; check your account’s current entitlement. Guestin itself is self-hosted.",
    ],
    [
      "Create an incoming scene",
      "Sign in at web.ewelink.cc. Choose Scene → Add scene, name it, select Webhook as the trigger (If), then choose the device action (Then). Save and copy its generated URL from the webhook icon.",
    ],
    [
      "Configure Guestin",
      "In Doors, edit a door and choose the eWeLink webhook preset. Use the copied URL’s base endpoint in URL and move its id value into a query-parameter row. Keep the endpoint’s region; do not substitute a different region. Use GET, no request body, and eWeLink response checking.",
    ],
    [
      "Test and troubleshoot",
      "Save, then use Test opening only when safe. Verify the scene and device action separately. Keep the URL private: it can trigger the scene. A provider response does not prove physical opening.",
    ],
  ],
  it: [
    [
      "Prima di iniziare",
      "Servono un dispositivo funzionante e l’accesso a eWeLink Web. eWeLink include Web nel piano Advanced: verifica i diritti del tuo account. Guestin è self-hosted.",
    ],
    [
      "Crea una scena in ingresso",
      "Accedi a web.ewelink.cc. Scegli Scene → Add scene, assegna un nome, usa Webhook come trigger (If) e scegli l’azione del dispositivo (Then). Salva e copia l’URL dall’icona webhook.",
    ],
    [
      "Configura Guestin",
      "In Porte, modifica una porta e scegli il preset webhook eWeLink. Inserisci l’endpoint base copiato nel campo URL e il valore id in una riga dei parametri query. Conserva la regione dell’endpoint. Usa GET, corpo vuoto e controllo risposta eWeLink.",
    ],
    [
      "Prova e risolvi problemi",
      "Salva e usa Prova apertura solo quando è sicuro. Verifica separatamente scena e dispositivo. Mantieni privato l’URL: attiva la scena. La risposta del provider non dimostra l’apertura fisica.",
    ],
  ],
};
export const Route = createFileRoute("/docs/ewelink")({
  component: Guide,
  head: () => ({ meta: [{ title: guide.title + " — Guestin integration guide" }] }),
});
function Guide() {
  const { lang } = useI18n();
  return (
    <SiteShell>
      <main className="site-section integration-guide">
        <a href="/docs">← {lang === "it" ? "Integrazioni" : "Integrations"}</a>
        <h1>{guide.title}</h1>
        <p>
          {lang === "it"
            ? "Guida verificata sulle fonti ufficiali · 10 novembre 2026"
            : "Checked against official documentation · 10 November 2026"}
        </p>
        {guide[lang].map(([title, body], i) => (
          <section key={title} className="mt-10">
            <h2>
              {i + 1} · {title}
            </h2>
            <p>{body}</p>
          </section>
        ))}
        <h2 className="mt-12">{lang === "it" ? "Fonti ufficiali" : "Official sources"}</h2>
        <ul>
          {guide.sources.map(([label, url]) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {label} ↗
              </a>
            </li>
          ))}
        </ul>
      </main>
    </SiteShell>
  );
}
