export const guestPageLanguages = {
  en: "English",
  it: "Italiano",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
} as const;

export type GuestPageLanguage = keyof typeof guestPageLanguages;
export type GuestCopyKind = "intro" | "singleUse";
export const builtInGuestCopy: Record<
  GuestPageLanguage,
  Record<GuestCopyKind, string>
> = {
  en: {
    intro:
      "If it is your first access to our BnB, you can open all the doors from this webpage. For future accesses, you will need to use the keys that you will find inside the room.",
    singleUse:
      "⚠️ This code is single-use, you will find keys on the desk inside the room to be able to open the door again.",
  },
  it: {
    intro:
      "Per il tuo primo accesso in struttura puoi aprire tutte le porte da questa pagina web, per i futuri accessi dovrai utilizzare le chiavi che troverai sulla scrivania all'interno della stanza.",
    singleUse:
      "⚠️ Questo codice è monouso, per favore prendi le chiavi all'interno della stanza per poter aprire la porta di nuovo.",
  },
  de: {
    intro:
      "Bei Ihrem ersten Zugang zu unserem BnB können Sie alle Türen über diese Webseite öffnen. Für zukünftige Zugriffe müssen Sie die Schlüssel verwenden, die Sie im Zimmer finden werden.",
    singleUse:
      "⚠️ Dieser Code ist nur einmal verwendbar. Sie finden Schlüssel auf dem Schreibtisch im Zimmer, um die Tür wieder öffnen zu können.",
  },
  fr: {
    intro:
      "Si c'est votre premier accès à notre BnB, vous pouvez ouvrir toutes les portes depuis cette page web. Pour les accès futurs, vous devrez utiliser les clés que vous trouverez dans la chambre.",
    singleUse:
      "⚠️ Ce code est à usage unique, vous trouverez les clés sur le bureau dans la chambre pour pouvoir ouvrir la porte à nouveau.",
  },
  es: {
    intro:
      "Si es tu primer acceso a nuestro BnB, puedes abrir todas las puertas desde esta página web. Para futuros accesos, necesitarás usar las llaves que encontrarás dentro de la habitación.",
    singleUse:
      "⚠️ Este código es de un solo uso, encontrarás las llaves en el escritorio dentro de la habitación para poder abrir la puerta nuevamente.",
  },
};
