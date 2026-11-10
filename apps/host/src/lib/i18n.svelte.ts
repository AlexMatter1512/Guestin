export type HostLocale = "en" | "it";
export const hostLanguage = $state({ current: "en" as HostLocale });
const italian: Record<string, string> = {
  "Email delivery (SMTP)": "Invio email (SMTP)",
  "Verification and password recovery emails":
    "Email di verifica e recupero password",
  "Connect any SMTP server to send verification and password recovery emails. You can skip this and let owners generate recovery links.":
    "Collega un server SMTP per inviare email di verifica e recupero password. Puoi saltare questo passaggio e lasciare che i proprietari generino i link di recupero.",
  "SMTP host": "Host SMTP",
  Port: "Porta",
  "Connection security": "Sicurezza della connessione",
  "Unencrypted (trusted relay only)":
    "Non crittografata (solo relay attendibili)",
  "Use SSL/TLS for ports 465 or 2465; STARTTLS for 25, 587 or 2587.":
    "Usa SSL/TLS per le porte 465 o 2465; STARTTLS per 25, 587 o 2587.",
  "SMTP username": "Nome utente SMTP",
  "SMTP password": "Password SMTP",
  "Leave blank to keep saved password":
    "Lascia vuoto per mantenere la password salvata",
  "Sender email": "Email del mittente",
  "Sender name": "Nome del mittente",
  "Save SMTP settings": "Salva impostazioni SMTP",
  "SMTP settings saved": "Impostazioni SMTP salvate",
  "Send test email": "Invia email di prova",
  "Test email sent to your address": "Email di prova inviata al tuo indirizzo",
  "Disable SMTP": "Disattiva SMTP",
  "SMTP disabled": "SMTP disattivato",
  "Verify email": "Verifica email",
  "Reset password": "Reimposta password",
  "Password reset. Sign in with your new password.":
    "Password reimpostata. Accedi con la nuova password.",
  "Email verified. You can now recover your password by email.":
    "Email verificata. Ora puoi recuperare la password tramite email.",
  "If your email is verified and email delivery is configured, a reset link will arrive shortly. Otherwise ask an owner for a link.":
    "Se la tua email è verificata e l’invio email è configurato, riceverai presto un link di recupero. Altrimenti chiedi un link a un proprietario.",
  "If the account exists, the owners can now see your request and generate a reset link.":
    "Se l’account esiste, i proprietari possono ora vedere la richiesta e generare un link di recupero.",
  "Confirm your email address to enable password recovery by email.":
    "Conferma il tuo indirizzo email per abilitare il recupero password tramite email.",
  "Ask for a password reset link":
    "Richiedi un link per reimpostare la password",
  "Send reset email (verified addresses only)":
    "Invia email di recupero (solo indirizzi verificati)",
  "Back to sign in": "Torna all’accesso",
  "Forgot password?": "Password dimenticata?",
  "Email verified": "Email verificata",
  "Email not verified": "Email non verificata",
  "Send verification email": "Invia email di verifica",
  "Verification email sent. The link expires in 10 minutes.":
    "Email di verifica inviata. Il link scade tra 10 minuti.",
  "Email delivery is not configured. Ask an owner for password recovery.":
    "L’invio email non è configurato. Chiedi a un proprietario di recuperare la password.",
  "Password reset requested": "Reimpostazione password richiesta",
  "Generate password reset link": "Genera link di recupero password",
  "Share this link privately. It is valid for 10 minutes and can be used once.":
    "Condividi questo link in privato. È valido per 10 minuti e può essere usato una sola volta.",
  "Password reset link": "Link di recupero password",
  Expires: "Scade",
  "Set up email delivery": "Configura l’invio email",
  "Connect email delivery for verification and password recovery, or continue to use owner-generated reset links.":
    "Configura l’invio email per la verifica e il recupero password oppure continua usando i link generati dai proprietari.",
  "Link invalid or expired": "Link non valido o scaduto",
  "Configure SMTP first": "Configura prima SMTP",
  "Test email failed. Check SMTP settings and try again.":
    "Invio dell’email di prova fallito. Controlla le impostazioni SMTP e riprova.",
  "Email delivery is not configured": "L’invio email non è configurato",
  "Verification email failed. Try again later.":
    "Invio dell’email di verifica fallito. Riprova più tardi.",
  "Wait a minute before requesting another email":
    "Attendi un minuto prima di richiedere un’altra email",

  Collaborator: "Collaboratore",
  collaborator: "collaboratore",
  "Owner / Admin": "Proprietario / Admin",
  "Invite and manage collaborators": "Invita e gestisci i collaboratori",
  "Former collaborator": "Ex collaboratore",
  "Create access codes": "Crea codici di accesso",
  "Create new doors": "Crea nuove porte",
  "Use booking connectors": "Usa i connettori delle prenotazioni",
  "Create staff access codes": "Crea codici di accesso staff",
  "Promote to owner": "Promuovi a proprietario",
  "Confirm promotion": "Conferma promozione",
  "Delete account": "Elimina account",
  "Delete my account": "Elimina il mio account",
  "Account updated": "Account aggiornato",
  "Owners and admins have the same unrestricted role. Collaborators only receive the permissions you enable below.":
    "Proprietari e admin hanno lo stesso ruolo senza restrizioni. I collaboratori ricevono solo i permessi abilitati qui sotto.",
  "New collaborators start without permissions. Code permissions also control editing and managing codes of that type.":
    "I nuovi collaboratori iniziano senza permessi. I permessi dei codici controllano anche la modifica e la gestione dei codici di quel tipo.",
  "Only you can delete your owner account. Another owner must remain.":
    "Solo tu puoi eliminare il tuo account proprietario. Deve rimanere un altro proprietario.",
  "Owners can only delete their own accounts.":
    "I proprietari possono eliminare solo il proprio account.",
  "This grants unrestricted administration, including deleting collaborator accounts, configuring connectors and wiping the entire database. Owners cannot be demoted or deleted by another owner.":
    "Concede l’amministrazione completa, inclusa l’eliminazione dei collaboratori, la configurazione dei connettori e la cancellazione dell’intero database. Un proprietario non può essere declassato o eliminato da un altro proprietario.",
  "This permanently deletes this account and revokes all its sessions and notification subscriptions. Workspace data and access codes are preserved. This cannot be undone.":
    "Elimina definitivamente l’account e revoca tutte le sue sessioni e iscrizioni alle notifiche. I dati dello spazio di lavoro e i codici di accesso vengono conservati. Non è possibile annullare l’operazione.",
  "Promote another owner before deleting your account":
    "Promuovi un altro proprietario prima di eliminare il tuo account",
  "Owner accounts cannot be changed by another account":
    "Gli account proprietari non possono essere modificati da un altro account",
  "Collaborator permission required: createAccessCodes":
    "Serve il permesso per creare codici di accesso",
  "Collaborator permission required: createStaffCodes":
    "Serve il permesso per creare codici staff",
  "Collaborator permission required: createDoors":
    "Serve il permesso per creare porte",
  "Collaborator permission required: useBookingConnectors":
    "Serve il permesso per usare i connettori delle prenotazioni",

  Notes: "Note",
  "Delete permanently": "Elimina definitivamente",
  "Permanently deleted": "Eliminazione definitiva completata",
  "Type to confirm": "Digita per confermare",
  Deactivated: "Disattivata",
  Deactivate: "Disattiva",
  Reactivate: "Riattiva",
  "Structure deactivated": "Struttura disattivata",
  "Structure reactivated": "Struttura riattivata",
  "Deactivation hides this structure and disables guest links while preserving its data.":
    "La disattivazione nasconde la struttura e disabilita i link ospiti, conservando i dati.",
  "This permanently deletes the structure and all its doors, codes, usage history, notifications and settings. This cannot be undone.":
    "Elimina definitivamente la struttura e tutte le sue porte, i codici, lo storico degli utilizzi, le notifiche e le impostazioni. Non è possibile annullare l’operazione.",
  "This permanently deletes this code, its usage history and notifications. Its guest link will stop working. This cannot be undone.":
    "Elimina definitivamente il codice, lo storico degli utilizzi e le notifiche. Il link ospite smetterà di funzionare. Non è possibile annullare l’operazione.",
  "Non revoked": "Non revocati",
  "Staff codes": "Codici staff",
  "Staff name / label": "Nome staff / etichetta",
  "Search staff access…": "Cerca accessi staff…",
  "Staff access code": "Codice di accesso staff",
  "No time limit": "Senza limiti di orario",
  "Use + below to create a staff access code.":
    "Usa il + in basso per creare un codice di accesso staff.",
  "No staff codes yet": "Nessun codice staff",
  "Time-unrestricted access for cleaners, laundry and other staff. Door permissions and revocation still apply.":
    "Accesso senza limiti di orario per pulizie, lavanderia e altro personale. Restano validi i permessi delle porte e la revoca.",
  "No start or end date. Door permissions and single-use rules still apply.":
    "Nessuna data di inizio o fine. Restano validi i permessi delle porte e le regole monouso.",
  "Install app": "Installa app",
  "Add oshost to your iPhone or Android Home Screen":
    "Aggiungi oshost alla Home di iPhone o Android",
  "Guest links": "Link ospiti",
  "Default check-in and instructions links":
    "Link check-in e istruzioni predefiniti",
  "KrossBooking, calendars and AI": "KrossBooking, calendari e AI",
  "No codes for this date": "Nessun codice per questa data",
  "Choose another date or use + below to create an access code.":
    "Scegli un’altra data o usa il + in basso per creare un codice di accesso.",
  "All structures": "Tutte le strutture",
  Allowed: "Consentito",
  Blocked: "Bloccato",
  "Not requested": "Non richiesto",
  "Not supported": "Non supportato",
  "All activity types": "Tutti i tipi di attività",
  ". Choose event types below. No selection means no push notifications.":
    ". Scegli i tipi di attività qui sotto. Senza selezioni non riceverai notifiche push.",
  "Open link": "Apri link",
  "Clear search": "Cancella ricerca",
  "Invalid access code attempts (including page loads)":
    "Tentativi con codici non validi (anche all’apertura della pagina)",
  "Click the highlighted + button. Give the door a name such as “Example entrance”. You will add a device connector later, so no device account or credentials are needed now.":
    "Tocca il pulsante + evidenziato. Dai alla porta un nome come “Ingresso di esempio”. Aggiungerai un connettore in seguito: ora non servono account o credenziali.",
  "Ask an owner to add a property and a door. You can explore Doors now, or skip this guide and return from App tour in Settings once setup is ready.":
    "Chiedi a un proprietario di aggiungere una struttura e una porta. Puoi esplorare Porte, oppure saltare la guida e riprenderla da Tour app nelle Impostazioni quando la configurazione è pronta.",
  "Access code created": "Codice creato",
  "Access code updated": "Codice aggiornato",
  "Access code revoked": "Codice revocato",
  "Door permission changed": "Permesso porta modificato",
  "Door deleted": "Porta eliminata",
  "Door test accepted": "Test porta accettato",
  "Door test failed": "Test porta fallito",
  "Door test uncertain": "Test porta incerto",
  "Door test resolved": "Test porta risolto",
  "Device request resolved": "Richiesta dispositivo risolta",
  Statistics: "Statistiche",
  Structure: "Struttura",
  "Notification history": "Cronologia notifiche",
  "Push on this device": "Push su questo dispositivo",
  Breakfast: "Colazioni",
  "Breakfast page and password protection":
    "Pagina colazioni e protezione con password",
  Profile: "Profilo",
  "Your account": "Il tuo account",
  Role: "Ruolo",
  "Account ID": "ID account",
  Back: "Indietro",
  Cancel: "Annulla",
  Close: "Chiudi",
  Details: "Dettagli",
  "Created by": "Creato da",
  "Successful requests": "Richieste riuscite",
  "Multiple uses": "Uso multiplo",
  "Pause permission": "Sospendi permesso",
  "Resume permission": "Riattiva permesso",
  Paused: "Sospeso",
  "Door disabled": "Porta disabilitata",
  Uncertain: "Incerto",
  Upcoming: "Futuro",
  Expired: "Scaduto",
  "Valid now": "Valido ora",
  "No available doors": "Nessuna porta disponibile",
  "Valid on date": "Valido in data",
  Status: "Stato",
  "All codes": "Tutti i codici",
  "Clear filters": "Rimuovi filtri",
  "Visit guest page": "Visita pagina ospite",
  "Prepare message": "Prepara messaggio",
  "Reset to default": "Ripristina predefinito",
  "Live sample preview": "Anteprima in tempo reale",
  Appearance: "Aspetto",
  Theme: "Tema",
  System: "Sistema",
  Light: "Chiaro",
  Dark: "Scuro",
  "Danger zone": "Area pericolosa",
  "Wipe database…": "Svuota database…",
  "Current password": "Password attuale",
  "Change password": "Cambia password",
  "New password": "Nuova password",
  "Confirm new password": "Conferma nuova password",
  "Passwords do not match": "Le password non coincidono",
  "Changing your password signs out every device, including this one.":
    "Cambiare la password disconnette tutti i dispositivi, incluso questo.",
  "Password changed. Sign in again on each device.":
    "Password cambiata. Accedi di nuovo su ogni dispositivo.",
  "Type WIPE ALL DATA to confirm": "Digita WIPE ALL DATA per confermare",
  "Permanently wipe database": "Svuota definitivamente il database",
  "An identical access code already exists. Create another anyway?":
    "Esiste già un codice di accesso identico. Vuoi crearne un altro?",
  "An identical access code already exists. Saving requires confirmation.":
    "Esiste già un codice di accesso identico. Il salvataggio richiede conferma.",
  "Reset this template to its default text? Save templates to publish the change.":
    "Ripristinare il testo predefinito? Salva i modelli per pubblicare la modifica.",
  "Your choice is saved to your account across devices. Guest language is independent.":
    "La scelta viene salvata nel tuo account su tutti i dispositivi. La lingua ospite è indipendente.",
  "Tour preference could not be saved. Reconnect and dismiss the tour again.":
    "Impossibile salvare la preferenza del tour. Riconnettiti e chiudi nuovamente il tour.",
  "Wipe the entire workspace database, including all users, properties, doors, photos, access codes, breakfast history, credentials, templates, activity and notification subscriptions. All guest links and sessions stop working. This cannot be undone without a backup.":
    "Svuota l’intero database, inclusi utenti, strutture, porte, foto, codici di accesso, storico colazioni, credenziali, modelli, attività e iscrizioni alle notifiche. Tutti i link ospite e le sessioni smetteranno di funzionare. Non è possibile annullare senza un backup.",
  "This deletes data for the whole team, not just your account. Back up the database and encryption keys first. You will need the server setup token to create a new owner. Server configuration, encryption keys and existing backups are not deleted.":
    "Verranno eliminati i dati di tutto il team, non solo del tuo account. Esegui prima un backup del database e delle chiavi di cifratura. Per creare un nuovo proprietario servirà il token di configurazione del server. La configurazione del server, le chiavi di cifratura e i backup esistenti non vengono eliminati.",
  "I have a backup or accept permanent data loss, and I have the setup token.":
    "Ho un backup o accetto la perdita definitiva dei dati e ho il token di configurazione.",

  "breakfasts left": "colazioni rimaste",
  "doors ·": "porte ·",
  "A live connection is required. Please try again when online.":
    "È necessaria una connessione. Riprova quando sei online.",
  ...{
    Codes: "Codici",
    Doors: "Porte",
    Create: "Crea",
    Activity: "Attività",
    Settings: "Impostazioni",
    Connectors: "Connettori",
    Messages: "Messaggi",
    Reports: "Statistiche",
    "Guest access": "Accesso ospiti",
    "Host workspace": "Area host",
    "oshost · Host workspace": "oshost · Area host",
    "oshost / host workspace": "oshost / area host",
    "Main navigation": "Navigazione principale",
    "Take the app tour": "Avvia il tour dell’app",
    "Workspace /": "Area di lavoro /",
    "Sign out": "Esci",
    "New code": "Nuovo codice",
    "Create access code": "Crea codice di accesso",
    "+ Create access code": "+ Crea codice di accesso",
    "Edit access code": "Modifica codice di accesso",
    "Set up your workspace": "Configura la tua struttura",
    "Join your team": "Unisciti al tuo team",
    "Welcome back": "Bentornato",
    "Create workspace": "Crea area di lavoro",
    "Join team": "Unisciti al team",
    "Sign in": "Accedi",
    "Opening your workspace…": "Apertura dell’area di lavoro…",
    "Simple, secure guest access.": "Accesso ospiti semplice e sicuro.",
    "Your name": "Il tuo nome",
    "Setup token": "Token di configurazione",
    Email: "Email",
    Password: "Password",
    "Guest name / label": "Nome ospite / etichetta",
    Property: "Struttura",
    "Internal notes": "Note interne",
    "Online check-in link": "Link per il check-in online",
    "Instructions link": "Link alle istruzioni",
    "Door permissions": "Permessi delle porte",
    "Times use": "Orari nel fuso",
    ". Each door has its own rules.": ". Ogni porta ha le proprie regole.",
    "Valid from": "Valido dal",
    "Valid until": "Valido fino al",
    "Single use": "Monouso",
    "Add a property in Settings, then connect a door in Doors.":
      "Aggiungi una struttura nelle Impostazioni, poi configura una porta in Porte.",
    "Include breakfast": "Includi colazione",
    "Total breakfasts": "Colazioni totali",
    "First breakfast date": "Prima data per la colazione",
    "Last breakfast date": "Ultima data per la colazione",
    "Save access code": "Salva codice di accesso",
    "Active permissions are published after the server confirms this save.":
      "I permessi diventano attivi dopo la conferma del salvataggio da parte del server.",
    Discard: "Annulla",
    "Create a guest link with the doors and breakfast allowance they need.":
      "Crea un link ospite con le porte e le colazioni necessarie.",
    "Search guest access…": "Cerca accessi ospiti…",
    "Search codes": "Cerca codici",
    "No breakfast": "Nessuna colazione",
    Active: "Attivo",
    Revoked: "Revocato",
    Edit: "Modifica",
    "Copy link": "Copia link",
    Share: "Condividi",
    "Replace link": "Sostituisci link",
    Revoke: "Revoca",
    "Uncertain device request:": "Richiesta al dispositivo con esito incerto:",
    ". Verify the door before permitting another request.":
      ". Controlla la porta prima di consentire una nuova richiesta.",
    "Mark consumed": "Segna come utilizzato",
    "Permit retry": "Consenti nuovo tentativo",
    "Your next guest starts here": "Il prossimo ospite inizia da qui",
    "Create a link with just the doors and breakfast allowance they need.":
      "Crea un link con le porte e le colazioni necessarie.",
    "Access attempts, device responses and breakfast usage.":
      "Tentativi di accesso, risposte dei dispositivi e utilizzo delle colazioni.",
    Refresh: "Aggiorna",
    "Code creation and usage": "Creazione e utilizzo dei codici",
    "Grouped by creation month in the property timezone. Attempts and accepted requests are lifetime totals for those codes.":
      "Raggruppati per mese di creazione nel fuso della struttura. Tentativi e richieste accettate comprendono tutta la durata dei codici.",
    "Host / month": "Host / mese",
    Created: "Creati",
    Used: "Utilizzati",
    Attempts: "Tentativi",
    Accepted: "Accettate",
    "Prefill an access code": "Precompila un codice di accesso",
    "Fetch only when needed. Select a result, review its details, then save the access code.":
      "Recupera i dati quando servono. Scegli un risultato, controllalo e salva il codice di accesso.",
    Connection: "Connessione",
    "Choose a connection": "Scegli una connessione",
    "Hotel ID": "ID hotel",
    Username: "Nome utente",
    "Password · never saved": "Password · mai salvata",
    "Sign in to KrossBooking": "Accedi a KrossBooking",
    "Choose verification method": "Scegli il metodo di verifica",
    "Send verification code": "Invia codice di verifica",
    "Verification code": "Codice di verifica",
    Verify: "Verifica",
    "Load Kross properties": "Carica strutture Kross",
    "Kross property": "Struttura Kross",
    "Select property": "Seleziona struttura",
    "Load arrivals": "Carica arrivi",
    Search: "Cerca",
    "Search reservations": "Cerca prenotazioni",
    "Provider response": "Risposta del fornitore",
    "Provider data stays in this session.":
      "I dati del fornitore rimangono in questa sessione.",
    "Calendar door": "Porta del calendario",
    "Choose door": "Scegli una porta",
    "Fetch calendar now": "Recupera calendario ora",
    Screenshot: "Schermata",
    "The selected image is sent to Gemini for extraction. It is not saved by oshost.":
      "L’immagine selezionata viene inviata a Gemini per l’estrazione. oshost non la salva.",
    "Import an .ics file": "Importa file .ics",
    "→ Review draft": "→ Controlla bozza",
    "Add a shared connection": "Aggiungi connessione condivisa",
    Name: "Nome",
    Provider: "Fornitore",
    "Calendar URL": "URL del calendario",
    "Gemini API key": "Chiave API Gemini",
    Model: "Modello",
    "Save the connection, then sign in to KrossBooking above. Your password is never stored.":
      "Salva la connessione, poi accedi a KrossBooking qui sopra. La password non viene mai salvata.",
    "Shared credentials are encrypted and are never displayed again.":
      "Le credenziali condivise sono cifrate e non vengono più mostrate.",
    "Save connection": "Salva connessione",
    Remove: "Rimuovi",
    "Prepare a guest message": "Prepara un messaggio per l’ospite",
    "Choose guest": "Scegli un ospite",
    Language: "Lingua",
    English: "Inglese",
    Message: "Messaggio",
    "Access link": "Link di accesso",
    "Check-in": "Check-in",
    Instructions: "Istruzioni",
    "Generate preview": "Genera anteprima",
    "Copy message": "Copia messaggio",
    "Property templates": "Modelli della struttura",
    "Load templates": "Carica modelli",
    "Placeholders:": "Segnaposto:",
    "Save templates": "Salva modelli",
    "The doors your guests can use.":
      "Le porte che i tuoi ospiti possono utilizzare.",
    "doors in": "porte in",
    "your property": "la tua struttura",
    "Add door": "Aggiungi porta",
    "Edit door": "Modifica porta",
    "Add your property first": "Aggiungi prima la tua struttura",
    "Then connect the doors guests will access.":
      "Poi configura le porte per gli ospiti.",
    "Set up a property": "Configura una struttura",
    "Ask an owner to set up a property and its doors.":
      "Chiedi a un proprietario di configurare una struttura e le sue porte.",
    "Back to doors": "Torna alle porte",
    Integration: "Integrazione",
    "Connect later (example door)": "Collega più tardi (porta di esempio)",
    "Common door · preselected": "Porta comune · preselezionata",
    "Single use by default": "Monouso per impostazione predefinita",
    "eWeLink webhook code": "Codice webhook eWeLink",
    "Shelly Cloud host": "Host Shelly Cloud",
    "Device ID": "ID dispositivo",
    "API key": "Chiave API",
    "Leave credentials empty when editing to keep existing values.":
      "Durante la modifica, lascia vuote le credenziali per mantenere quelle esistenti.",
    "This is an example door. You will add a device connector later. No unlock request can be sent until it is connected.":
      "Questa è una porta di esempio. Aggiungerai un connettore per il dispositivo più tardi. Nessuna richiesta di apertura può essere inviata finché non è collegata.",
    "Translated door names (optional)":
      "Nomi tradotti delle porte (facoltativi)",
    "Save door": "Salva porta",
    "Not connected yet": "Non ancora collegata",
    "Common door": "Porta comune",
    "Room door": "Porta della camera",
    " · Single use": " · Monouso",
    "No doors yet": "Nessuna porta ancora",
    "Add an entrance or room, connect its device, and choose its default access rules.":
      "Aggiungi un ingresso o una camera, collega il dispositivo e scegli le regole di accesso predefinite.",
    "An owner can add doors for your team.":
      "Un proprietario può aggiungere porte per il team.",
    "Workspace tools": "Strumenti dell’area di lavoro",
    "Prefill a code from KrossBooking, a calendar or an image":
      "Precompila un codice da KrossBooking, un calendario o un’immagine",
    "Prepare and copy guest messages":
      "Prepara e copia messaggi per gli ospiti",
    "See code creation and usage": "Consulta creazione e utilizzo dei codici",
    "App tour": "Tour dell’app",
    "A quick guide to your host workspace":
      "Una guida rapida alla tua area host",
    "Notifications & installation": "Notifiche e installazione",
    "Install this app from your browser menu. On iPhone: Share → Add to Home Screen, then enable notifications here.":
      "Installa l’app dal menu del browser. Su iPhone: Condividi → Aggiungi alla schermata Home, poi abilita qui le notifiche.",
    "Permission:": "Permesso:",
    ". Leave filters empty to receive all activity.":
      ". Lascia vuoti i filtri per ricevere tutte le attività.",
    "Event filter (comma-separated, optional)":
      "Filtro eventi (separati da virgole, facoltativo)",
    "Enable / update notifications": "Abilita / aggiorna notifiche",
    "Disable notifications": "Disabilita notifiche",
    "Public breakfast totals": "Totali pubblici delle colazioni",
    "Open public breakfast page ↗": "Apri pagina pubblica delle colazioni ↗",
    "Add property": "Aggiungi struttura",
    "Edit property": "Modifica struttura",
    "Edit selected property": "Modifica struttura selezionata",
    Timezone: "Fuso orario",
    "Default arrival time": "Orario di arrivo predefinito",
    "Default departure time": "Orario di partenza predefinito",
    "Save property": "Salva struttura",
    Team: "Team",
    "Create & copy staff invitation": "Crea e copia invito per collaboratore",
    "Invitations expire after 24 hours and can be used once.":
      "Gli inviti scadono dopo 24 ore e possono essere utilizzati una sola volta.",
    "Working…": "Operazione in corso…",
    owner: "proprietario",
    staff: "collaboratore",
    "Your unfinished draft has been restored.":
      "La bozza non completata è stata ripristinata.",
    "Access code saved. The guest link is ready to share.":
      "Codice di accesso salvato. Il link ospite è pronto da condividere.",
    "Door saved.": "Porta salvata.",
    "Copied to clipboard.": "Copiato negli appunti.",
    "Templates saved.": "Modelli salvati.",
    "Notifications disabled.": "Notifiche disabilitate.",
    "Shared connection saved.": "Connessione condivisa salvata.",
    "Select your example door before saving this access code.":
      "Seleziona la porta di esempio prima di salvare questo codice di accesso.",
    "Create your first property": "Crea la tua prima struttura",
    "Add your first door": "Aggiungi la tua prima porta",
    "Create your first access code": "Crea il tuo primo codice di accesso",
    "Your first access code is ready":
      "Il tuo primo codice di accesso è pronto",
    "Your owner sets up the property": "Il proprietario configura la struttura",
    "Give your property a name, confirm its timezone and save it with Add property. The guide continues only after it is saved.":
      "Assegna un nome alla struttura, conferma il fuso orario e salvala con Aggiungi struttura. La guida prosegue solo dopo il salvataggio.",
    "Click the highlighted Settings button. We’ll create your property first, then an example door and an access code. You’ll save each item yourself.":
      "Premi il pulsante Impostazioni evidenziato. Creeremo prima la tua struttura, poi una porta di esempio e un codice di accesso. Salverai ogni elemento personalmente.",
    "Your property is ready. Click the highlighted Doors button to add an example door. You will add a device connector later.":
      "La struttura è pronta. Premi Porte, il pulsante evidenziato, per aggiungere una porta di esempio. Aggiungerai un connettore per il dispositivo più tardi.",
    "Click Add door. Give it a name such as “Example entrance”. You will add a device connector later, so no device account or credentials are needed now.":
      "Premi Aggiungi porta. Scegli un nome, ad esempio “Ingresso di esempio”. Aggiungerai un connettore per il dispositivo più tardi: per ora non servono account o credenziali del dispositivo.",
    "Name your example door, leave Integration on Connect later, and click Save door. You will add a device connector later; this door cannot unlock anything yet.":
      "Assegna un nome alla porta di esempio, lascia Integrazione su Collega più tardi e premi Salva porta. Aggiungerai un connettore per il dispositivo più tardi; questa porta non può ancora aprire nulla.",
    "Enter a guest name, select your door below, and review its validity times. Breakfast is optional. Click Save access code when you’re ready.":
      "Inserisci il nome dell’ospite, seleziona la porta e controlla gli orari di validità. Le colazioni sono facoltative. Quando sei pronto, premi Salva codice di accesso.",
    " The example door stays inactive until you add its connector.":
      " La porta di esempio resta inattiva finché non aggiungi il suo connettore.",
    "Your example door is ready. Click the highlighted + button to create an access code. Existing properties and doors are reused when you replay this guide.":
      "La porta di esempio è pronta. Premi il pulsante + evidenziato per creare un codice di accesso. Ripetendo questa guida, verranno riutilizzate le strutture e le porte esistenti.",
    "Your access code is saved. Use Copy link on the highlighted card to share it.":
      "Il codice di accesso è salvato. Premi Copia link sulla scheda evidenziata per condividerlo.",
    " You will add a device connector later by editing the door in Doors; until then, guests cannot open the example door.":
      " Aggiungerai un connettore per il dispositivo più tardi modificando la porta in Porte; fino ad allora gli ospiti non possono aprire la porta di esempio.",
    " You can manage its permissions and revoke the link from this card.":
      " Puoi gestire i permessi e revocare il link da questa scheda.",
    "Ask an owner to add a property and a door. You can explore Doors now, or skip this guide and return using the ? button once setup is ready.":
      "Chiedi a un proprietario di aggiungere una struttura e una porta. Puoi esplorare Porte, oppure saltare la guida e riaprirla con il pulsante ? quando la configurazione sarà pronta.",
    "Guided setup": "Configurazione guidata",
    "GUIDED SETUP": "CONFIGURAZIONE GUIDATA",
    "Skip tour": "Salta il tour",
    "Finish setup": "Termina configurazione",
    "Follow the highlighted part of the app. You can skip whenever you like.":
      "Segui la parte evidenziata dell’app. Puoi saltare il tour quando vuoi.",
    "App language": "Lingua dell’app",
    "Your choice is saved for your account in this browser. Guest language is independent.":
      "La scelta è salvata per il tuo account in questo browser. La lingua degli ospiti è indipendente.",
  },
};
const redesignedItalian: Record<string, string> = {
  "Server logs are retained after a database wipe.":
    "I log del server vengono conservati dopo lo svuotamento del database.",
  "Uncertain requests": "Richieste incerte",
  "Invalid guest links": "Link ospite non validi",
  "Access codes": "Codici di accesso",
  Properties: "Strutture",
  "Message templates": "Modelli messaggi",
  "Light, dark or follow your device":
    "Chiaro, scuro o come il tuo dispositivo",
  "Italiano or English": "Italiano o inglese",
  Notifications: "Notifiche",
  "Choose the updates you receive": "Scegli gli aggiornamenti da ricevere",
  "Names, timezones and arrival defaults": "Nomi, fusi orari e orari di arrivo",
  "KrossBooking, calendars and image import":
    "KrossBooking, calendari e importazione da immagini",
  "Personalize what you share with guests":
    "Personalizza i messaggi per gli ospiti",
  "Invite and manage your staff": "Invita e gestisci il tuo staff",
  "Code creation and usage by host": "Creazione e utilizzo dei codici per host",
  "Breakfast totals": "Totali colazioni",
  "Open the public count page": "Apri la pagina pubblica dei conteggi",
  "Data management": "Gestione dati",
  "Backups and workspace reset": "Backup e ripristino dell’area di lavoro",
  Preferences: "Preferenze",
  Workspace: "Area di lavoro",
  Administration: "Amministrazione",
  "Manage your workspace and preferences":
    "Gestisci la tua area di lavoro e le preferenze",
  "Copy code": "Copia codice",
  "Guest link": "Link ospite",
  "Access code value": "Valore del codice di accesso",
  "Guest link value": "Valore del link ospite",
  "Previous day": "Giorno precedente",
  "Next day": "Giorno successivo",
  Today: "Oggi",
  "All dates": "Tutte le date",
  Filters: "Filtri",
  "Needs review": "Da verificare",
  "No matching codes": "Nessun codice corrispondente",
  "Manage access": "Gestisci accesso",
  "Replacing or revoking a link takes effect immediately.":
    "La sostituzione o revoca di un link ha effetto immediato.",
  "Open Properties to set up your first structure.":
    "Apri Strutture per configurare la tua prima struttura.",
  "Click Add property to give your structure a name and timezone.":
    "Premi Aggiungi struttura per impostare nome e fuso orario.",
  "Create invitation": "Crea invito",
  "Invitation link": "Link di invito",
  "Copy invitation": "Copia invito",
  "Notify me about": "Avvisami per",
  "Access accepted": "Accessi accettati",
  "Access denied": "Accessi negati",
  "Device failures": "Errori dei dispositivi",
  "Breakfast usage": "Utilizzo colazioni",
  "Rejected breakfasts": "Colazioni rifiutate",
  "Only aggregate totals are public. Guest details stay private.":
    "Sono pubblici solo i totali aggregati. I dati degli ospiti restano privati.",
  "Export a backup on the server before resetting the workspace.":
    "Esporta un backup sul server prima di reimpostare l’area di lavoro.",
  "Choose a section from Settings.": "Scegli una sezione dalle Impostazioni.",
  "Choose doors and share a guest link":
    "Scegli le porte e condividi un link ospite",
  "Connect an entrance or room": "Collega un ingresso o una stanza",
  "Copy manually": "Copia manualmente",
  "Your browser could not copy automatically. Select the text below, then use Copy or press Ctrl/Cmd+C.":
    "Il browser non ha potuto copiare automaticamente. Seleziona il testo, poi usa Copia o premi Ctrl/Cmd+C.",
  "Text to copy": "Testo da copiare",
  "Select text": "Seleziona testo",
  Dismiss: "Chiudi",
  Calendars: "Calendari",
  "Image import": "Importa immagine",
  "Template language": "Lingua del modello",
  "Template type": "Tipo di modello",
  Italian: "Italiano",
  English: "Inglese",
  "No doors": "Nessuna porta",
  "Access revoked.": "Accesso revocato.",
  "Guest link replaced.": "Link ospite sostituito.",
  "Check the door before allowing another request.":
    "Verifica la porta prima di consentire un’altra richiesta.",
  "Revoke this guest link immediately?": "Revocare subito questo link ospite?",
  "Invalidate the previous link and generate a replacement?":
    "Invalidare il link precedente e generarne uno nuovo?",
};
export function t(source: string) {
  return hostLanguage.current === "it"
    ? (redesignedItalian[source] ?? italian[source] ?? source)
    : source;
}
export function savedHostLocale(userId: string): HostLocale | null {
  const locale = localStorage.getItem("oshost.host.locale." + userId);
  return locale === "it" || locale === "en" ? locale : null;
}
export function restoreHostLocale(userId: string) {
  hostLanguage.current = savedHostLocale(userId) ?? "en";
}
export function setHostLocale(userId: string, locale: HostLocale) {
  hostLanguage.current = locale;
  localStorage.setItem("oshost.host.locale." + userId, locale);
}
