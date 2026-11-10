export type Lang = "en" | "it";
export const translations = {
  en: {
    contact: {
      back: "← Back",
      kicker: "Get in touch",
      titleA: "Contact",
      titleB: "the team",
      sub: "Pick your favorite channel below. We usually reply within one business day.",
    },
    beta: {
      whatsappText: "Hello Guestin",
      emailSubject: "Guestin",
      emailBody: "Hello Guestin",
      requestAccess: "Contact →",
      whatsappLabel: "WhatsApp",
      whatsappDetail: "Fastest reply",
      telegramLabel: "Telegram",
      telegramDetail: "Chat with the team",
      emailLabel: "Email",
      emailDetail: "beta@guestin.app",
    },
    lang: {
      en: "EN",
      it: "IT",
      switch: "Language",
    },
    hero: {
      titleA: "Guest access for",
      titleRotators: ["hotels", "B&Bs", "apartments"],
      titleB: "no subscriptions",
      titleC: "or hardware lock-in.",
    },
    problem: {
      kicker: "The problem",
      title: "Most guest-access tools force the wrong tradeoff.",
      items: [
        "Some systems lock you into one hardware ecosystem.",
        "Some add another monthly subscription before you ever use them.",
        "Some guest flows are easy for staff but painful for guests.",
        "Some tools are built for hardware first, hospitality second.",
      ],
      footer: "GuestIn is open source, self-hosted, and built to work with the devices you choose.",
    },
  },
  it: {
    contact: {
      back: "← Indietro",
      kicker: "Mettiti in contatto",
      titleA: "Contatta",
      titleB: "il team",
      sub: "Scegli il canale che preferisci. Di solito rispondiamo entro un giorno lavorativo.",
    },
    beta: {
      whatsappText: "Hello Guestin",
      emailSubject: "Guestin",
      emailBody: "Hello Guestin",
      requestAccess: "Contact →",
      whatsappLabel: "WhatsApp",
      whatsappDetail: "Risposta più veloce",
      telegramLabel: "Telegram",
      telegramDetail: "Scrivi al team",
      emailLabel: "Email",
      emailDetail: "beta@guestin.app",
    },
    lang: {
      en: "EN",
      it: "IT",
      switch: "Lingua",
    },
    hero: {
      titleA: "Accesso ospiti per",
      titleRotators: ["hotel", "B&B", "appartamenti"],
      titleB: "senza abbonamenti",
      titleC: "né vincoli hardware.",
    },
    problem: {
      kicker: "Il problema",
      title: "La maggior parte dei sistemi di accesso ti costringe a scendere a compromessi.",
      items: [
        "Alcuni ti vincolano a un unico ecosistema hardware.",
        "Altri aggiungono un altro abbonamento mensile prima ancora di usarli davvero.",
        "Alcuni sono comodi per lo staff ma fastidiosi per gli ospiti.",
        "Molti strumenti sono pensati prima per l'hardware e poi per l'ospitalità.",
      ],
      footer: "GuestIn è open source, sul tuo server e compatibile con i dispositivi che scegli.",
    },
  },
};
export type Translation = (typeof translations)["en"];
