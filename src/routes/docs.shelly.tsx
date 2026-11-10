import { sitePath } from "@/lib/site-path";
import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";
import { useI18n } from "@/i18n/LanguageContext";
const guide = {
  title: "Shelly Cloud",
  sources: [
    [
      "Shelly: account, cloud key and host",
      "https://shelly-api-docs.shelly.cloud/cloud-control-api/",
    ],
    [
      "Shelly: v2 switch control",
      "https://shelly-api-docs.shelly.cloud/cloud-control-api/communication-v2/",
    ],
  ],
  en: [
    [
      "Find your cloud credentials",
      "Add the device to Shelly Smart Control and connect it to the cloud. Under User settings → Authorization cloud key, copy the key and assigned server URI. Find the device ID in the device information screen. Keep the key private; changing the account password changes it.",
    ],
    [
      "Configure Guestin",
      "Choose the Shelly Cloud webhook preset in Doors. Replace the example host with your assigned host. Use POST to /v2/devices/api/set/switch and put auth_key in a query row. Set Content-Type to application/json in a header row and HTTP response checking.",
    ],
    [
      "Set the output",
      "Use the JSON body below, replacing the device ID and channel. toggle_after is an optional return delay in seconds; choose timing suitable for your hardware. This switches an output on; it does not operate a cover endpoint.",
    ],
    [
      "Check the result",
      "Save and test safely. Verify the actual output. Shelly limits this API to one request per second. Check the host, key, channel and online status if requests fail.",
    ],
  ],
  it: [
    [
      "Recupera le credenziali cloud",
      "Aggiungi il dispositivo a Shelly Smart Control e collegalo al cloud. In User settings → Authorization cloud key copia chiave e URI del server assegnato. Trova l’ID nelle informazioni del dispositivo. Mantieni privata la chiave; cambia quando modifichi la password.",
    ],
    [
      "Configura Guestin",
      "Scegli il preset webhook Shelly Cloud in Porte. Sostituisci l’host di esempio con quello assegnato. Usa POST su /v2/devices/api/set/switch e auth_key in una riga query. Imposta l’header Content-Type su application/json e il controllo risposta HTTP.",
    ],
    [
      "Imposta l’uscita",
      "Usa il JSON seguente, sostituendo ID e canale. toggle_after è un ritardo opzionale in secondi per tornare allo stato opposto: adattalo al dispositivo. Questo endpoint attiva un’uscita, non una tapparella.",
    ],
    [
      "Verifica il risultato",
      "Salva e prova in sicurezza. Verifica fisicamente l’uscita. Shelly limita l’API a una richiesta al secondo. In caso di errore controlla host, chiave, canale e stato online.",
    ],
  ],
  example:
    'POST https://YOUR_ASSIGNED_HOST/v2/devices/api/set/switch\nQuery: auth_key = YOUR_AUTH_KEY\nHeader: Content-Type = application/json\n\n{"id":"YOUR_DEVICE_ID","channel":0,"on":true,"toggle_after":1}',
};
export const Route = createFileRoute("/docs/shelly")({
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
