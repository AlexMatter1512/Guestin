import en from "./en.json";
import it from "./it.json";
import de from "./de.json";
import fr from "./fr.json";
import es from "./es.json";
import { locale_state } from "$lib/states.svelte";

// Define the structure of translation objects
type TranslationKeys = keyof typeof en;
export type LocaleKey = keyof typeof translations;

const translations = { en, it, de, fr, es } as const;
export const translations_keys = Object.keys(translations) as LocaleKey[];
export const localeInfo: Record<LocaleKey, { emoji: string; name: string }> = {
  en: { emoji: "🇬🇧", name: "English" },
  it: { emoji: "🇮🇹", name: "Italiano" },
  de: { emoji: "🇩🇪", name: "Deutsch" },
  fr: { emoji: "🇫🇷", name: "Français" },
  es: { emoji: "🇪🇸", name: "Español" },
};

// Keep backward compatibility for existing code
export const translations_emojis: Record<LocaleKey, string> =
  Object.fromEntries(
    Object.entries(localeInfo).map(([key, value]) => [key, value.emoji]),
  ) as Record<LocaleKey, string>;

export function getRequestedLocale(
  langQueryParam?: string | null,
  acceptLanguageHeader?: string | null,
): LocaleKey {
  // Priority 1: lang query parameter
  if (
    langQueryParam &&
    translations_keys.includes(langQueryParam as LocaleKey)
  ) {
    return langQueryParam as LocaleKey;
  }

  // Priority 2: Accept-Language header
  if (acceptLanguageHeader) {
    const preferredLanguages = acceptLanguageHeader
      .split(",")
      .map((lang) => lang.trim().split(";")[0].toLowerCase().substring(0, 2));

    for (const lang of preferredLanguages) {
      if (translations_keys.includes(lang as LocaleKey)) {
        return lang as LocaleKey;
      }
    }
  }

  // Priority 3: Default to 'en'
  return "en";
}

const allowanceText: Record<LocaleKey, string> = {
  en: "Breakfasts can only be used during the allowed period shown below.",
  it: "Le colazioni possono essere utilizzate solo nel periodo consentito indicato qui sotto.",
  de: "Frühstücke können nur im unten angegebenen Zeitraum genutzt werden.",
  fr: "Les petits-déjeuners peuvent être utilisés uniquement pendant la période autorisée ci-dessous.",
  es: "Los desayunos solo se pueden utilizar durante el período permitido que se muestra abajo.",
};
const pendingText: Record<LocaleKey, string> = {
  en: "A breakfast request is still unconfirmed. Retry the same quantity before submitting a different amount.",
  it: "Una richiesta di colazioni non è ancora confermata. Riprova con la stessa quantità prima di inviarne una diversa.",
  de: "Eine Frühstücksanfrage ist noch unbestätigt. Versuchen Sie dieselbe Menge erneut, bevor Sie eine andere auswählen.",
  fr: "Une demande de petit-déjeuner reste non confirmée. Réessayez avec la même quantité avant d’en choisir une autre.",
  es: "Una solicitud de desayuno sigue sin confirmar. Reintenta la misma cantidad antes de elegir otra.",
};
export function t(key: string): string {
  if (
    key === "usage_period_explanation" ||
    key === "colazioni_period_invalid_message"
  )
    return allowanceText[locale_state.current];
  const lang = locale_state.current as LocaleKey;

  // Type assertion to tell TypeScript this is a valid key
  return translations[lang]?.[key as TranslationKeys] ?? key;
}

const extra: Record<string, Record<string, string>> = {
  en: {
    disabled: "Temporarily unavailable",
    paused: "Temporarily unavailable",
    photo: "Photo",
    unconfigured: "Not connected yet",
    accepted: "Request accepted",
    uncertain:
      "The result is uncertain. Contact your host before trying again.",
    retry: "Refresh",
    offline: "A live connection is required. Please try again when online.",
    breakfast: "Breakfast",
    used: "Already used",
    redeem: "Use breakfasts",
    submitted: "Breakfast usage recorded.",
    single: "This door can be used once. Keep your keys after entering.",
    access: "Guest access",
    expired: "Expired",
    future: "Not yet valid",
  },
  it: {
    disabled: "Temporaneamente non disponibile",
    paused: "Temporaneamente non disponibile",
    photo: "Foto",
    unconfigured: "Non ancora collegata",
    accepted: "Richiesta accettata",
    uncertain: "Esito incerto. Contatta il gestore prima di riprovare.",
    retry: "Aggiorna",
    offline: "È necessaria una connessione. Riprova quando sei online.",
    breakfast: "Colazioni",
    used: "Già utilizzato",
    redeem: "Usa colazioni",
    submitted: "Colazioni registrate.",
    single: "Questa porta può essere usata una volta. Conserva le chiavi.",
    access: "Accesso ospiti",
    expired: "Scaduto",
    future: "Non ancora valido",
  },
  fr: {
    disabled: "Temporairement indisponible",
    paused: "Temporairement indisponible",
    photo: "Photo",
    unconfigured: "Pas encore connectée",
    accepted: "Demande acceptée",
    uncertain: "Résultat incertain. Contactez votre hôte avant de réessayer.",
    retry: "Actualiser",
    offline: "Une connexion est nécessaire.",
    breakfast: "Petit-déjeuner",
    used: "Déjà utilisé",
    redeem: "Utiliser",
    submitted: "Utilisation enregistrée.",
    single: "Accès unique. Gardez vos clés.",
    access: "Accès invités",
    expired: "Expiré",
    future: "Pas encore valide",
  },
  es: {
    disabled: "Temporalmente no disponible",
    paused: "Temporalmente no disponible",
    photo: "Foto",
    unconfigured: "Todavía sin conectar",
    accepted: "Solicitud aceptada",
    uncertain:
      "Resultado incierto. Contacta con tu anfitrión antes de reintentar.",
    retry: "Actualizar",
    offline: "Se necesita conexión.",
    breakfast: "Desayuno",
    used: "Ya utilizado",
    redeem: "Usar desayunos",
    submitted: "Uso registrado.",
    single: "Acceso de un solo uso. Conserva tus llaves.",
    access: "Acceso de huéspedes",
    expired: "Caducado",
    future: "Todavía no válido",
  },
  de: {
    disabled: "Vorübergehend nicht verfügbar",
    paused: "Vorübergehend nicht verfügbar",
    photo: "Foto",
    unconfigured: "Noch nicht verbunden",
    accepted: "Anfrage angenommen",
    uncertain:
      "Ergebnis ungewiss. Bitte vor einem neuen Versuch den Gastgeber kontaktieren.",
    retry: "Aktualisieren",
    offline: "Eine Verbindung ist erforderlich.",
    breakfast: "Frühstück",
    used: "Bereits verwendet",
    redeem: "Frühstücke einlösen",
    submitted: "Verbrauch gespeichert.",
    single: "Einmaliger Zugang. Bitte Schlüssel mitnehmen.",
    access: "Gastzugang",
    expired: "Abgelaufen",
    future: "Noch nicht gültig",
  },
};

export function guestText(key: string) {
  if (key === "pendingBreakfast") return pendingText[locale_state.current];
  return extra[locale_state.current]?.[key] ?? extra.en[key] ?? key;
}
