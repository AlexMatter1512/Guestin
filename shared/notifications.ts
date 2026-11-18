import {
  formatDateTime,
  DEFAULT_DATE_FORMAT,
  type DateFormat,
} from "./date-format";
export type NotificationCategory = "guest" | "staff";
export type NotificationContext = {
  category?: NotificationCategory;
  codeLabel?: string;
  doorName?: string;
  doorId?: string;
  actor?: string;
  validFrom?: string;
  validTo?: string;
  timezone?: string;
  detail?: string;
  action?: "page" | "door" | "breakfast";
  suppressedAttempts?: number;
  previousVisit?: { label: string; date: string };
};
const titles: Record<string, [string, string]> = {
  "account.reset_requested": [
    "Password reset requested",
    "Richiesta di reimpostazione password",
  ],
  "code.created": ["Access code created", "Codice di accesso creato"],
  "code.updated": ["Access code updated", "Codice di accesso aggiornato"],
  "code.deleted": ["Access code deleted", "Codice di accesso eliminato"],
  "code.revoked": ["Access code revoked", "Codice di accesso revocato"],
  "code.permission": ["Door permission changed", "Permesso porta modificato"],
  "door.created": ["Door created", "Porta creata"],
  "door.reordered": ["Doors reordered", "Porte riordinate"],
  "door.updated": ["Door updated", "Porta aggiornata"],
  "door.deleted": ["Door deleted", "Porta eliminata"],
  "device.test.accepted": ["Door test accepted", "Test porta accettato"],
  "device.test.failed": ["Door test failed", "Test porta fallito"],
  "device.test.uncertain": ["Door test uncertain", "Test porta incerto"],
  "device.test.resolved": ["Door test resolved", "Test porta risolto"],
  "device.resolved": [
    "Device request resolved",
    "Richiesta dispositivo risolta",
  ],
  "access.accepted": ["Door opened", "Porta aperta"],
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
export function notificationTitle(type: string, language = "en") {
  const it = language === "it";
  return (
    titles[type]?.[it ? 1 : 0] ??
    (it ? "Aggiornamento attività" : "Activity update")
  );
}
export function notificationCategory(event: {
  type: string;
  context?: NotificationContext;
}): NotificationCategory {
  return (
    event.context?.category ??
    (event.context?.actor || !/^(access|breakfast)\./.test(event.type)
      ? "staff"
      : "guest")
  );
}
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
  "Invalid webhook configuration":
    "La configurazione del webhook non è valida.",
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
  "Guest link replaced": "Il link ospite è stato sostituito.",
};
export function notificationText(
  event: { type: string; message: string; context?: NotificationContext },
  language = "en",
  fallbackLabel?: string,
  dateFormat: DateFormat = DEFAULT_DATE_FORMAT,
) {
  const it = language === "it",
    context = event.context ?? {};
  let title = notificationTitle(event.type, language);
  let actor = context.actor?.trim();
  const label = context.codeLabel || fallbackLabel;
  let body = event.message;
  if (
    event.type === "access.accepted" ||
    event.type === "device.test.accepted"
  ) {
    if (context.doorName) title += ` · ${context.doorName}`;
    body = actor ?? "";
    actor = undefined;
  } else if (event.type === "access.invalid") {
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
    if (context.suppressedAttempts)
      body = it
        ? `${context.suppressedAttempts} tentativi con link non valido sono stati raggruppati.`
        : `${context.suppressedAttempts} invalid-link attempts suppressed.`;
    if (context.previousVisit)
      body += it
        ? ` Questo browser dichiara una visita precedente: ${context.previousVisit.label} (${formatDateTime(context.previousVisit.date, dateFormat)}). Informazione non verificata.`
        : ` This browser reports a previous visit: ${context.previousVisit.label} (${formatDateTime(context.previousVisit.date, dateFormat)}). Unverified information.`;
  } else if (event.type === "code.created" && actor) {
    const date = (value: string) =>
      formatDateTime(value, dateFormat, context.timezone ?? "UTC");
    body = it
      ? `${actor} ha creato il codice di accesso ${label ?? ""}`
      : `${actor} created access code ${label ?? ""}`;
    if (context.validFrom && context.validTo)
      body += it
        ? ` valido dal ${date(context.validFrom)} al ${date(context.validTo)}`
        : ` valid from ${date(context.validFrom)} to ${date(context.validTo)}`;
    if (context.timezone) body += ` (${context.timezone})`;
    actor = undefined;
  } else if (event.type === "breakfast.redeemed") {
    const count = /^([0-9]+) breakfast/.exec(event.message)?.[1];
    body = count
      ? it
        ? `${count} colazioni utilizzate.`
        : `${count} breakfasts redeemed.`
      : it
        ? "Colazione utilizzata."
        : "Breakfast redeemed.";
  } else if (event.type === "door.created" || event.type === "door.updated") {
    if (actor && context.doorName) {
      const verb =
        event.type === "door.created"
          ? it
            ? "ha creato la porta"
            : "created door"
          : it
            ? "ha aggiornato la porta"
            : "updated door";
      body = `${actor} ${verb} ${context.doorName}.`;
      actor = undefined;
    }
  } else if (event.type === "door.deleted") {
    body =
      (it ? "Porta eliminata: " : "Door deleted: ") +
      (context.doorName ?? event.message.replace(/^Door deleted: /, ""));
  } else if (event.type === "device.test.resolved") {
    body = it
      ? "Il test incerto è stato verificato."
      : "The uncertain door test was checked.";
  } else {
    const legacySeparator =
      actor && context.doorName && event.message.startsWith(actor + " ")
        ? event.message.indexOf(": ")
        : -1;
    const reason =
      context.detail ??
      (legacySeparator >= 0
        ? event.message.slice(legacySeparator + 2)
        : event.message);
    body = it
      ? (reasons[reason] ??
        titles[event.type]?.[1] ??
        "È stata registrata una nuova attività.")
      : reason;
  }
  if (actor) {
    const subject =
      context.doorName && event.type !== "door.deleted"
        ? `${actor} · ${context.doorName}`
        : actor;
    body = body ? `${subject}: ${body}` : subject;
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
