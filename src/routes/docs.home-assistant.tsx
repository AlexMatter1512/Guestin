import { sitePath } from "@/lib/site-path";
import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";
import { useI18n } from "@/i18n/LanguageContext";
const guide = {
  title: "Home Assistant",
  sources: [
    [
      "Home Assistant: webhook setup and security",
      "https://www.home-assistant.io/triggers/webhook/",
    ],
    [
      "Home Assistant: authenticated REST actions",
      "https://contributors.home-assistant.io/core/internals/rest-api/",
    ],
  ],
  en: [
    [
      "Choose the right connection",
      "Home Assistant explicitly advises against webhooks for unlocking locks or opening garage doors. They authenticate only through a secret URL. Use the steps below for benign automations; for door control, use the authenticated REST action route instead.",
    ],
    [
      "Webhook setup",
      "In Settings → Automations & scenes, create an automation with a Webhook trigger and a benign action. Copy its URL. In Guestin’s generic HTTP configuration, use that URL with POST, an empty body and HTTP response checking. Keep the ID secret and local-only access enabled where possible.",
    ],
    [
      "Verify execution",
      "The Guestin server must reach Home Assistant. Inspect automation traces: a 200 response can also occur for an unknown webhook ID or a request rejected by local-only restrictions.",
    ],
    [
      "Authenticated alternative",
      "Create a long-lived access token in your Home Assistant profile. In Guestin, set POST to /api/services/DOMAIN/SERVICE, add Authorization: Bearer YOUR_TOKEN and Content-Type: application/json header rows, and supply the target entity in JSON. Use the service appropriate to your installation and protect the token.",
    ],
  ],
  it: [
    [
      "Scegli il collegamento adatto",
      "Home Assistant sconsiglia esplicitamente i webhook per sbloccare serrature o aprire garage: l’URL segreto è l’unica autenticazione. Usa i passaggi seguenti per automazioni innocue; per le porte usa azioni REST autenticate.",
    ],
    [
      "Configura un webhook",
      "In Settings → Automations & scenes crea un’automazione con trigger Webhook e un’azione innocua. Copia l’URL. Nella configurazione HTTP generica di Guestin usa questo URL con POST, corpo vuoto e controllo risposta HTTP. Mantieni segreto l’ID e l’accesso solo locale quando possibile.",
    ],
    [
      "Verifica l’esecuzione",
      "Il server Guestin deve raggiungere Home Assistant. Controlla le tracce: una risposta 200 può arrivare anche per ID inesistenti o richieste bloccate dall’accesso solo locale.",
    ],
    [
      "Alternativa autenticata",
      "Crea un token di lunga durata nel profilo Home Assistant. In Guestin imposta POST su /api/services/DOMAIN/SERVICE, aggiungi gli header Authorization: Bearer YOUR_TOKEN e Content-Type: application/json e specifica l’entità nel JSON. Usa il servizio adatto alla tua installazione e proteggi il token.",
    ],
  ],
  example:
    'POST https://YOUR_HOME_ASSISTANT/api/services/DOMAIN/SERVICE\nHeader: Authorization = Bearer YOUR_TOKEN\nHeader: Content-Type = application/json\n\n{"entity_id":"YOUR_ENTITY_ID"}',
};
export const Route = createFileRoute("/docs/home-assistant")({
  component: Guide,
  head: () => ({ meta: [{ title: guide.title + " — Guestin integration guide" }] }),
});
function Guide() {
  const { lang } = useI18n();
  return (
    <SiteShell>
      <main className="site-section integration-guide">
        <a href={sitePath("/docs")}>← {lang === "it" ? "Integrazioni" : "Integrations"}</a>
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
        <pre className="command">{guide.example}</pre>
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
