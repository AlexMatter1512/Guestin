import { useState, useRef } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { repo } from "./SiteShell";
import { useI18n } from "@/i18n/LanguageContext";
export function AskAI() {
  const { lang } = useI18n();
  const it = lang === "it";
  const prompt = `how can this free project help automating my short term rental business?\n${repo}`;
  const [status, setStatus] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      return true;
    } catch {
      field.current?.focus();
      field.current?.select();
      try {
        return document.execCommand("copy");
      } catch {
        return false;
      }
    }
  }
  async function ask(name: string, url: string) {
    const copying = copy();
    window.open(url, "_blank", "noopener,noreferrer");
    const ok = await copying;
    setStatus(
      ok
        ? it
          ? `Prompt copiato. Incollalo in ${name}.`
          : `Prompt copied. Paste it into ${name}.`
        : it
          ? "Seleziona e copia il prompt qui sopra."
          : "Select and copy the prompt above.",
    );
  }
  return (
    <section className="site-section ai-prompt">
      <p className="eyebrow">{it ? "CHIEDI ALLA TUA AI" : "ASK YOUR AI"}</p>
      <h2>
        {it ? "Cosa potrebbe fare per la tua attività?" : "What could this do for your business?"}
      </h2>
      <label htmlFor="ai-prompt">
        {it ? "Un prompt pronto da copiare" : "A ready-to-copy prompt"}
      </label>
      <textarea id="ai-prompt" ref={field} readOnly value={prompt} rows={3} />
      <div className="ai-actions">
        {[
          ["ChatGPT", "https://chatgpt.com/"],
          ["Claude", "https://claude.ai/new"],
          ["Gemini", "https://gemini.google.com/app"],
        ].map(([name, url]) => (
          <button type="button" key={name} onClick={() => void ask(name, url)}>
            {it ? "Chiedi a" : "Ask"} {name}
            <ExternalLink size={15} aria-hidden="true" />
          </button>
        ))}
        <button
          type="button"
          onClick={async () =>
            setStatus(
              (await copy())
                ? it
                  ? "Copiato!"
                  : "Copied!"
                : it
                  ? "Seleziona e copia il testo."
                  : "Select and copy the text.",
            )
          }
        >
          <Copy size={16} aria-hidden="true" />
          {it ? "Copia" : "Copy"}
        </button>
      </div>
      <p className="ai-help">
        {it
          ? "I pulsanti copiano il prompt e aprono il servizio scelto. Incollalo nella tua chat."
          : "Buttons copy the prompt and open your chosen service. Paste it into your chat."}
      </p>
      <p role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
