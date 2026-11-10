import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/i18n/LanguageContext";
import { SiteShell, repo } from "@/components/SiteShell";
import { useState } from "react";
export const Route = createFileRoute("/get-started")({
  component: Guide,
  head: () => ({ meta: [{ title: "Get started — Guestin self hosting" }] }),
});
function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <pre className="command">{text}</pre>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}
      >
        {copied ? "✓" : "Copy / Copia"}
      </button>
    </div>
  );
}
function Guide() {
  const { lang } = useI18n();
  const it = lang === "it";
  return (
    <SiteShell>
      <main className="site-section">
        <p className="eyebrow">SELF HOSTING</p>
        <h1>{it ? "Inizia con Guestin" : "Get started with Guestin"}</h1>
        <h2 className="mt-12">1 · {it ? "Avvia localmente con Bun" : "Run locally with Bun"}</h2>
        <p>
          {it
            ? "Installa Git e Bun 1.4 o successivo, poi esegui:"
            : "Install Git and Bun 1.4 or later, then run:"}
        </p>
        <Command
          text={
            "git clone " +
            repo +
            ".git\ncd guestin\nbun install --frozen-lockfile\nbun run build\nbun start"
          }
        />
        <p>
          {it
            ? "Copia setupToken dalla voce setup.required nei log. Apri l’indirizzo seguente, crea l’account proprietario e segui il tour."
            : "Copy setupToken from the setup.required startup log entry. Open the address below, create the owner account and follow the tour."}
        </p>
        <a href="http://localhost:3000/host/">http://localhost:3000/host/</a>
        <h2 className="mt-12">2 · Docker Compose</h2>
        <p>
          {it
            ? "Installa Docker con Compose. Salva il file in una cartella dedicata."
            : "Install Docker with Compose. Save this file in a dedicated folder."}{" "}
          <a href="/compose.local.yaml" download>
            compose.local.yaml ↓
          </a>
        </p>
        <Command
          text="docker compose -f compose.local.yaml up -d
docker compose -f compose.local.yaml logs guestin"
        />
        <p>
          {it
            ? "Copia il setupToken dai log e crea l’account su"
            : "Copy setupToken from the logs and create your account at"}{" "}
          <a href="http://localhost:38471/host/">http://localhost:38471/host/</a>.
        </p>
        <p>
          {it
            ? "L’immagine edge segue le build correnti. Il volume conserva database, immagini e chiavi. Non eliminarlo; esegui un backup prima degli aggiornamenti."
            : "The edge image follows current builds. The volume keeps your database, images and keys. Preserve it and back it up before updating."}
        </p>
        <h3>{it ? "Arresta e aggiorna" : "Stop and update"}</h3>
        <Command
          text="docker compose -f compose.local.yaml stop
docker compose -f compose.local.yaml pull
docker compose -f compose.local.yaml up -d"
        />
        <p>
          {it
            ? "Con Bun, Ctrl+C arresta il server. Conserva la cartella data. I backup JSON sono disponibili in Impostazioni → Gestione dati; esegui anche il backup del volume per conservare immagini e chiavi."
            : "With Bun, Ctrl+C stops the server. Preserve the data folder. JSON backups are available in Settings → Data management; back up the volume too to retain images and keys."}
        </p>
        <p>
          {it
            ? "Per l’accesso pubblico serve HTTPS e potrebbe essere necessario un reverse proxy. Imposta ORIGIN sull’indirizzo HTTPS pubblico."
            : "Public access requires HTTPS and may need a reverse proxy. Set ORIGIN to the public HTTPS address."}
        </p>
        <a href={repo + "/blob/main/docs/REFERENCE.md"}>
          {it ? "Documentazione completa" : "Full documentation"} ↗
        </a>
      </main>
    </SiteShell>
  );
}
