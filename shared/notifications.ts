export type NotificationContext = {
  codeLabel?: string;
  doorName?: string;
  actor?: string;
  validFrom?: string;
  validTo?: string;
  timezone?: string;
  detail?: string;
  action?: "page" | "door" | "breakfast";
  previousVisit?: { label: string; date: string };
};
const titles: Record<string, [string, string]> = {
  "code.created": ["Access code created", "Codice di accesso creato"],
  "code.updated": ["Access code updated", "Codice di accesso aggiornato"],
  "code.revoked": ["Access code revoked", "Codice di accesso revocato"],
  "code.permission": ["Door permission changed", "Permesso porta modificato"],
  "door.deleted": ["Door deleted", "Porta eliminata"],
  "device.test.accepted": ["Door test accepted", "Test porta accettato"],
  "device.test.failed": ["Door test failed", "Test porta fallito"],
  "device.test.uncertain": ["Door test uncertain", "Test porta incerto"],
  "device.test.resolved": ["Door test resolved", "Test porta risolto"],
  "device.resolved": [
    "Device request resolved",
    "Richiesta dispositivo risolta",
  ],
  "access.accepted": ["Access accepted", "Richiesta di accesso accettata"],
  "access.denied": ["Access denied", "Accesso negato"],
  "access.failed": [
    "Device request failed",
    "Richiesta al dispositivo fallita",
  ],
  "access.uncertain": [
    "Uncertain access request",
    "Richiesta di accesso incerta",
  ],
  "access.invalid": [
    "Invalid access code attempt",
    "Tentativo con codice non valido",
  ],
  "breakfast.redeemed": ["Breakfast redeemed", "Colazione utilizzata"],
  "breakfast.denied": ["Breakfast rejected", "Colazione rifiutata"],
};
export const notificationTypes = Object.keys(titles);
const reasons: Record<string, string> = {
  "Access expired": "Il codice è scaduto.",
  "Access is not yet valid": "Il codice non è ancora valido.",
  "Single-use access already consumed":
    "Il permesso monouso è già stato utilizzato.",
  "Door permission paused": "Il permesso per questa porta è sospeso.",
  "Door permission resumed": "Il permesso per questa porta è stato riattivato.",
  "Door disabled": "La porta è disabilitata.",
  "Door not permitted": "Questo codice non consente di usare la porta.",
  "Previous action is unresolved":
    "Una richiesta precedente è ancora da verificare.",
  "This door has no device connector yet":
    "La porta non ha ancora un connettore.",
  "Invalid Shelly Cloud host": "L’indirizzo Shelly Cloud non è valido.",
  "Provider rejected the request": "Il fornitore ha rifiutato la richiesta.",
  "Provider reported a failure": "Il fornitore ha segnalato un errore.",
  "Provider accepted the unlock request; physical state is not confirmed":
    "Il fornitore ha accettato la richiesta. L’apertura fisica della porta non è confermata.",
  "Unrecognized provider response":
    "La risposta del fornitore non è riconosciuta.",
  "Provider response did not confirm acceptance":
    "Il fornitore non ha confermato di aver accettato la richiesta.",
  "No conclusive provider response. Do not retry until checked.":
    "Nessuna risposta conclusiva. Verifica la porta prima di riprovare.",
  "Device response unavailable":
    "La risposta del dispositivo non è disponibile. Verifica la porta prima di riprovare.",
  "Device response unavailable; check the door before retrying":
    "La risposta del dispositivo non è disponibile. Verifica la porta prima di riprovare.",
  "Breakfast unavailable for this date or quantity":
    "La colazione non è disponibile per questa data o quantità.",
  "Host resolved uncertain action as consumed":
    "L’host ha segnato la richiesta incerta come utilizzata.",
  "Host resolved uncertain action as retry permitted":
    "L’host ha consentito un nuovo tentativo dopo la verifica.",
  "Access code created": "Il codice di accesso è stato creato.",
  "Access code updated": "Il codice di accesso è stato aggiornato.",
  "Access code revoked": "Il codice di accesso è stato revocato.",
};
export function notificationText(
  event: { type: string; message: string; context?: NotificationContext },
  language = "en",
  fallbackLabel?: string,
) {
  const it = language === "it",
    context = event.context ?? {};
  const title =
    titles[event.type]?.[it ? 1 : 0] ??
    (it ? "Aggiornamento attività" : "Activity update");
  const label = context.codeLabel || fallbackLabel;
  let body = event.message;
  if (event.type === "access.invalid") {
    body =
      context.action === "door"
        ? it
          ? "Tentativo di apertura con un link non valido o revocato."
          : "A door request used an invalid or revoked link."
        : context.action === "breakfast"
          ? it
            ? "Tentativo di utilizzo colazione con un link non valido o revocato."
            : "A breakfast request used an invalid or revoked link."
          : it
            ? "La pagina ospite è stata aperta con un link non valido o revocato."
            : "The guest page was requested with an invalid or revoked link.";
    if (context.previousVisit)
      body += it
        ? ` Questo browser dichiara una visita precedente: ${context.previousVisit.label} (${context.previousVisit.date}). Informazione non verificata.`
        : ` This browser reports a previous visit: ${context.previousVisit.label} (${context.previousVisit.date}). Unverified information.`;
  } else if (event.type === "code.created" && context.actor) {
    const date = (value: string) =>
      new Date(value).toLocaleString(it ? "it-IT" : "en-GB", {
        timeZone: context.timezone ?? "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      });
    body = it
      ? `${context.actor} ha creato il codice di accesso ${label ?? ""}`
      : `${context.actor} created access code ${label ?? ""}`;
    if (context.validFrom && context.validTo)
      body += it
        ? ` valido dal ${date(context.validFrom)} al ${date(context.validTo)}`
        : ` valid from ${date(context.validFrom)} to ${date(context.validTo)}`;
    if (context.timezone) body += ` (${context.timezone})`;
  } else if (event.type === "breakfast.redeemed") {
    const count = /^([0-9]+) breakfast/.exec(event.message)?.[1];
    body = count
      ? it
        ? `${count} colazioni utilizzate.`
        : `${count} breakfasts redeemed.`
      : it
        ? "Colazione utilizzata."
        : "Breakfast redeemed.";
  } else if (event.type === "door.deleted") {
    body =
      (it ? "Porta eliminata: " : "Door deleted: ") +
      (context.doorName ?? event.message.replace(/^Door deleted: /, ""));
  } else if (event.type === "device.test.resolved") {
    body =
      (context.actor ? context.actor + ": " : "") +
      (it
        ? "Il test incerto è stato verificato."
        : "The uncertain door test was checked.");
  } else {
    const reason =
      context.detail ??
      (context.actor && context.doorName
        ? event.message.split(": ").slice(1).join(": ")
        : event.message);
    body = reason;
    if (it)
      body =
        reasons[reason] ??
        titles[event.type]?.[1] ??
        "È stata registrata una nuova attività.";
    if (context.actor && context.doorName)
      body = `${context.actor} · ${context.doorName}: ${body}`;
  }
  return { title: label ? `${label} · ${title}` : title, body };
}

// Preserve legacy empty-filter behavior while allowing explicit opt-outs.
export function wantsNotification(
  preferences: {
    properties?: string[];
    events?: string[];
    allProperties?: boolean;
    allEvents?: boolean;
  },
  propertyId: string | null,
  type: string,
) {
  const properties = preferences.properties ?? [],
    events = preferences.events ?? [];
  const allProperties = preferences.allProperties ?? !properties.length;
  const propertyMatches = propertyId
    ? allProperties || properties.includes(propertyId)
    : allProperties || properties.length > 0;
  return (
    propertyMatches &&
    ((preferences.allEvents ?? !events.length) || events.includes(type))
  );
}
