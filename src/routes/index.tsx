import { sitePath } from "@/lib/site-path";
import { RotatingWord } from "@/components/RotatingWord";
import { AskAI } from "@/components/AskAI";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/LanguageContext";
import { DoorScrollScene } from "@/components/DoorScrollScene";
import { SiteShell, repo } from "@/components/SiteShell";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GuestIn — Guest access without subscriptions or hardware lock-in" },
      {
        name: "description",
        content:
          "Welcome your guests with a link. Self-host Guestin to manage doors, staff access and breakfast from one workspace.",
      },
    ],
  }),
  component: Home,
});
const features = [
  [
    "Email that fits your setup",
    "Use any SMTP server for mail verification and password recovery.",
    "Email con il tuo server",
    "Usa qualsiasi server SMTP per la verifica email e il recupero password.",
  ],
  [
    "Access on your terms",
    "Per-door dates, single-use access, editable and revocable guest links.",
    "Accesso alle tue condizioni",
    "Date per porta, accesso monouso e link modificabili e revocabili.",
  ],
  [
    "A workspace for your team",
    "Multiple properties, separate staff codes and collaborator permissions.",
    "Uno spazio per il team",
    "Più strutture, codici staff separati e permessi collaboratori.",
  ],
  [
    "Breakfast included",
    "Set allowances; guests redeem from their page. A separate counter keeps guest details private.",
    "Anche la colazione",
    "Imposta le quote; gli ospiti le utilizzano dalla loro pagina. Contatore separato senza dettagli ospiti.",
  ],
  [
    "Keep track",
    "Calendar, statistics, shared notification history and optional push notifications.",
    "Tutto sotto controllo",
    "Calendario, statistiche, cronologia condivisa e notifiche push opzionali.",
  ],
  [
    "Your data stays with you",
    "SQLite storage and portable JSON backups on your server.",
    "I dati restano tuoi",
    "SQLite e backup JSON portabili sul tuo server.",
  ],
  [
    "Feels like an app",
    "Installable web apps, light and dark themes. Host: English/Italian. Guests: English, Italian, French, Spanish and German.",
    "Come un’app",
    "Web app installabili, tema chiaro e scuro. Host: italiano/inglese. Ospiti: italiano, inglese, francese, spagnolo e tedesco.",
  ],
];
const shots = [
  ["workspace", "Host workspace", "Spazio host"],
  ["codes", "Mobile access codes", "Codici su mobile"],
  ["calendar", "Access calendar", "Calendario accessi"],
  ["doors", "Your doors", "Le tue porte"],
  ["create", "Create an access code", "Crea un codice"],
  ["guest", "Guest view", "Vista ospite"],
  ["breakfast", "Café partner view", "Vista caffè partner"],
];
function Home() {
  const { lang, t } = useI18n();
  const it = lang === "it";
  const [mobile, setMobile] = useState(false);
  const [nativeMobile, setNativeMobile] = useState(false);
  const [ready, setReady] = useState(false);
  const [guestCode, setGuestCode] = useState("demo-token-demo-0-0");
  const [cafeProperty, setCafeProperty] = useState("demo-0");
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const small = window.matchMedia("(max-width: 750px)").matches;
    setReady(true);
    setNativeMobile(small);
    setMobile(small);
  }, []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "guestin.demo.navigate"
      )
        return;
      if (typeof event.data.value !== "string") return;
      if (event.data.view === "guest") {
        setGuestCode(event.data.value);
        setView("guest");
      }
      if (event.data.view === "cafe") {
        setCafeProperty(event.data.value);
        setView("cafe");
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  const [view, setView] = useState("host");
  const [doorOpen, setDoorOpen] = useState<boolean | null>(null);
  const demoSrc = sitePath(
    view === "guest"
      ? `/demo/guest/#code=${encodeURIComponent(guestCode)}`
      : view === "cafe"
        ? `/demo/host/breakfast/${encodeURIComponent(cafeProperty)}/`
        : "/demo/host/",
  );
  const [image, setImage] = useState<string | null>(null);
  return (
    <SiteShell>
      <main>
        <section className="site-section hero-grid">
          <div>
            <p className="eyebrow">OPEN SOURCE · SELF HOSTED</p>
            <h1 className="hero-title">
              <span>{t.hero.titleA}</span>
              <span className="hero-title-rotator">
                <RotatingWord words={t.hero.titleRotators} />
              </span>
              <span>
                {t.hero.titleB} {t.hero.titleC}
              </span>
            </h1>
            <p className="lead hero-subtitle">let your guest in</p>
            <div className="actions">
              <a className="cta" href={sitePath("/get-started")}>
                {it ? "Inizia" : "Get started"} ↗
              </a>
              <a href="#demo">{it ? "Prova la demo" : "Try the demo"} ↓</a>
            </div>
            <p>
              {it
                ? "Nessun account richiesto agli ospiti. Tutti i connettori sono opzionali."
                : "No guest account needed. Every connector is optional."}
            </p>
          </div>
          <div className="door-scene">
            <DoorScrollScene manualOpen={doorOpen} />
            <div className="floating-guest">
              <small>{it ? "Link ospite" : "Guest link"}</small>
              <p>Villa Olive · Main entrance</p>
              <button
                className="cta"
                aria-pressed={doorOpen === true}
                onClick={() => setDoorOpen(doorOpen !== true)}
              >
                {doorOpen ? (it ? "Chiudi porta" : "Close door") : it ? "Apri porta" : "Open door"}
              </button>
            </div>
          </div>
        </section>
        <section className="site-section problem-section" id="problem">
          <p className="eyebrow">{t.problem.kicker}</p>
          <h2>{t.problem.title}</h2>
          <div className="problem-layout">
            <img
              className="problem-animation"
              src={sitePath("/animations/door-strike-unlock.gif")}
              alt={
                it
                  ? "Una serratura elettrica sblocca la porta"
                  : "An electric door strike unlocks the door"
              }
              width={508}
              height={249}
              loading="lazy"
            />
            <ul className="problem-grid">
              {t.problem.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <p className="problem-footer">{t.problem.footer}</p>
        </section>
        <AskAI />
        <section className="site-section" id="how">
          <p className="eyebrow">{it ? "COME FUNZIONA" : "HOW IT WORKS"}</p>
          <h2>{it ? "Dalla prenotazione al benvenuto." : "From booking to a warm welcome."}</h2>
          <div className="feature-grid">
            {(it
              ? [
                  [
                    "01 · Aggiungi la struttura",
                    "Configura fuso orario e porte. Puoi iniziare con una porta di esempio.",
                  ],
                  ["02 · Crea un accesso", "Scegli porte e orari. Aggiungi la colazione se serve."],
                  [
                    "03 · Condividi il link",
                    "Gli ospiti aprono la pagina nel browser. Puoi modificare o revocare l’accesso.",
                  ],
                ]
              : [
                  [
                    "01 · Add your property",
                    "Choose its timezone and doors. Start with an example door if you like.",
                  ],
                  [
                    "02 · Create access",
                    "Pick doors and times. Add a breakfast allowance when needed.",
                  ],
                  [
                    "03 · Share the link",
                    "Guests open their page in a browser. Edit or revoke access whenever needed.",
                  ],
                ]
            ).map(([a, b]) => (
              <article key={a}>
                <h3>{a}</h3>
                <p>{b}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="demo" data-ready={ready} className="site-section">
          <p className="eyebrow">{it ? "PROVALO" : "TAKE A LOOK AROUND"}</p>
          <h2>
            {it ? "Il vero spazio host. Dati di esempio." : "The real host workspace. Sample data."}
          </h2>
          <p>
            {it
              ? "Crea un codice, esplora il calendario e cambia struttura. Nessuna porta reale è collegata."
              : "Create a code, explore the calendar and switch properties. No real doors are connected."}
          </p>
          <div className="demo-selector" role="group" aria-label="Demo view">
            {[
              [
                "host",
                it ? "Host" : "Host view",
                it
                  ? "Crea codici di accesso per i tuoi ospiti"
                  : "Create access codes for your guests",
              ],
              [
                "guest",
                it ? "Ospite" : "Guest view",
                it
                  ? "Le porte a portata di tap, con un semplice link"
                  : "Guests see their doors with a simple tap of a link",
              ],
              [
                "cafe",
                it ? "Caffè partner" : "Café partner view",
                it
                  ? "Il caffè sa sempre quante colazioni devi pagare"
                  : "Your partner café always knows how many breakfasts you owe",
              ],
            ].map(([id, title, description]) => (
              <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
                <strong>{title}</strong>
                <span>{description}</span>
              </button>
            ))}
          </div>
          <div className="demo-tools">
            {!nativeMobile && (
              <button role="switch" aria-checked={mobile} onClick={() => setMobile(!mobile)}>
                {it ? "Vista mobile" : "Mobile view"} {mobile ? "✓" : ""}
              </button>
            )}
            <a href={demoSrc} target="_blank" rel="noreferrer">
              {it ? "Apri demo a schermo intero" : "Open expanded demo"} ↗
            </a>
          </div>
          <div className={mobile ? "demo-frame mobile" : "demo-frame"}>
            <iframe
              ref={frame}
              title={`Guestin ${view === "cafe" ? "café partner" : view} demo — fictional sample data`}
              src={demoSrc}
              loading="lazy"
              className="host-demo"
              sandbox="allow-scripts allow-same-origin allow-modals allow-downloads allow-forms"
              allow="clipboard-write"
            />
          </div>
          <p>
            <a href="#screenshots">
              {it
                ? "Preferisci le immagini? Esplora gli screenshot."
                : "Prefer a quick look? Browse the screenshots."}
            </a>
          </p>
        </section>
        <section id="screenshots" className="site-section">
          <h2>{it ? "Pensato per il lavoro quotidiano." : "Made for everyday hospitality."}</h2>
          <div className="shot-grid">
            {shots.map(([id, en, ita]) => (
              <figure key={id}>
                <button
                  onClick={() => setImage(id)}
                  aria-label={(it ? "Ingrandisci " : "Enlarge ") + (it ? ita : en)}
                >
                  <img
                    src={sitePath("/screenshots/" + id + ".png")}
                    alt={it ? ita : en}
                    loading="lazy"
                  />
                </button>
                <figcaption>{it ? ita : en}</figcaption>
              </figure>
            ))}
          </div>
        </section>
        <section id="features" className="site-section">
          <p className="eyebrow">{it ? "FUNZIONALITÀ" : "FEATURES"}</p>
          <h2>
            {it ? "Una piccola reception, sempre con te." : "A small front desk, always with you."}
          </h2>
          <div className="feature-grid">
            {features.map((f) => (
              <article key={f[0]}>
                <h3>{f[it ? 2 : 0]}</h3>
                <p>{f[it ? 3 : 1]}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="integrations" className="site-section integrations">
          <h2>IoT</h2>
          <p>HTTP webhooks · eWeLink · Shelly Cloud · Home Assistant</p>
          <p>
            {it
              ? "Home Assistant tramite automazioni HTTP/webhook. Le importazioni preparano una bozza: controlli e salvi tu."
              : "Home Assistant through HTTP/webhook automation. Imports prepare a draft: you review and save it."}
          </p>
          <a href={sitePath("/docs")}>
            {it ? "Esplora le integrazioni" : "Explore integrations"} →
          </a>
        </section>
        <section className="site-section integrations">
          <h2>{it ? "Prenotazioni" : "Reservations"}</h2>
          <p>KrossBooking · iCal · Gemini</p>
          <p>
            {it
              ? "Importa dettagli e controlla la bozza prima di creare il codice."
              : "Import details and review the draft before creating an access code."}
          </p>
          <a href={sitePath("/docs")}>
            {it ? "Integrazioni prenotazioni" : "Reservation integrations"} →
          </a>
        </section>
        <section id="get-started" className="site-section">
          <p className="eyebrow">SELF HOSTING</p>
          <h2>{it ? "Il tuo server. Il tuo benvenuto." : "Your server. Your welcome."}</h2>
          <p>
            {it
              ? "Avvia Guestin localmente con Bun o Docker Compose. Un solo container, nessun database separato."
              : "Run Guestin locally with Bun or Docker Compose. One container, no separate database server."}
          </p>
          <div className="actions">
            <a className="cta" href={sitePath("/get-started")}>
              {it ? "Guida passo passo" : "Step-by-step guide"} →
            </a>
            <a href={repo}>GitHub ↗</a>
          </div>
        </section>
        <section id="faq" className="site-section">
          <h2>FAQ</h2>
          {(it
            ? [
                [
                  "Gli ospiti devono installare un’app?",
                  "No. Aprono il link nel browser, senza account.",
                ],
                [
                  "Funziona offline?",
                  "Apertura porte e utilizzo colazioni richiedono una connessione al tuo server.",
                ],
                [
                  "Devo configurare le integrazioni?",
                  "No. Puoi creare accessi manualmente e aggiungere i connettori in seguito.",
                ],
              ]
            : [
                [
                  "Do guests need an app?",
                  "No. They open a link in their browser, without an account.",
                ],
                [
                  "Does it work offline?",
                  "Door requests and breakfast redemption need a connection to your server.",
                ],
                [
                  "Are integrations required?",
                  "No. Create access manually and add optional connectors later.",
                ],
              ]
          ).map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </main>
      {image && (
        <div
          className="image-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot"
          onKeyDown={(e) => {
            if (e.key === "Escape") setImage(null);
            if (e.key === "Tab") e.preventDefault();
          }}
          onClick={() => setImage(null)}
        >
          <button
            autoFocus
            onClick={() => setImage(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setImage(null);
            }}
          >
            {it ? "Chiudi" : "Close"} ×
          </button>
          <img
            src={sitePath("/screenshots/" + image + ".png")}
            alt={shots.find((s) => s[0] === image)?.[it ? 2 : 1]}
          />
        </div>
      )}
    </SiteShell>
  );
}
