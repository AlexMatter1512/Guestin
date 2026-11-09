<script lang="ts">
  import { untrack } from "svelte";
  import {
    CalendarDays,
    ChevronRight,
    Check,
    Plug,
    Image,
    Search,
    ArrowLeft,
    ArrowRight,
    X,
    Plus,
  } from "@lucide/svelte";
  import { hostLanguage, t } from "$lib/i18n.svelte";
  import { randomUUID } from "$lib/browser";
  import {
    KrossClient,
    calendarDrafts,
    parseExtraction,
    resizeImage,
    krossProperties,
    krossReservations,
    krossReservationDraft,
  } from "../../../../../shared/connectors";
  import type { AccessCodeDraft } from "../../../../../shared/schema";
  type View = "list" | "kross" | "ical" | "gemini";
  type Connection = {
    id: string;
    property_id: string;
    kind: string;
    name: string;
    data: Record<string, any>;
  };
  let {
    api,
    reload,
    connections,
    propertyId,
    doors,
    property,
    owner,
    onDraft,
    view = $bindable("list"),
  }: {
    api: (
      path: string,
      body?: any,
      method?: string,
      headers?: Record<string, string>,
    ) => Promise<any>;
    reload: () => Promise<void>;
    connections: Connection[];
    propertyId: string;
    doors: any[];
    property: any;
    owner: boolean;
    onDraft: (draft: AccessCodeDraft) => void;
    view?: View;
  } = $props();
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  let selectedId = $state(""),
    pending = $state(false),
    error = $state(""),
    notice = $state("");
  let hotelId = $state(""),
    username = $state(""),
    password = $state(""),
    deviceId = $state("");
  let factors = $state<any[]>([]),
    factorIndex = $state(""),
    verification = $state(""),
    codeSent = $state(false),
    connected = $state(false);
  let providerProperties = $state<any[]>([]),
    providerProperty = $state(""),
    records = $state<any[]>([]),
    hasNext = $state(false),
    page = $state(0),
    searched = $state(false),
    searchTerm = $state(""),
    mode = $state<"arrivals" | "search">("arrivals");
  let arrivalDate = $state(new Date().toISOString().slice(0, 10));
  let calendarDoor = $state(""),
    calendarUrl = $state(""),
    calendarName = $state(""),
    addingCalendar = $state(false),
    calendarResults = $state<Partial<AccessCodeDraft>[]>([]),
    calendarFileName = $state("");
  let geminiKey = $state(""),
    geminiModel = $state("gemini-2.5-flash"),
    imageFile = $state<File | null>(null),
    imageUrl = $state(""),
    extraction = $state<Partial<AccessCodeDraft> | null>(null),
    extractionBreakfast = $state<number | undefined>();
  let scope = "",
    loadedConnection = "",
    operation = 0;
  const localConnections = $derived(
    connections.filter((c) => c.property_id === propertyId),
  );
  const currentConnections = $derived(
    localConnections.filter((c) => c.kind === view),
  );
  const selected = $derived(
    currentConnections.find((c) => c.id === selectedId),
  );
  const localDoors = $derived(doors.filter((d) => d.propertyId === propertyId));
  const providers = [
    { id: "kross" as const, name: "KrossBooking", icon: Plug },
    { id: "ical" as const, name: "iCal", icon: CalendarDays },
    { id: "gemini" as const, name: "Gemini", icon: Image },
  ];
  $effect(() => {
    const next = propertyId + "/" + view;
    if (next === scope) return;
    scope = next;
    untrack(() => {
      operation++;
      pending = false;
      error = "";
      notice = "";
      records = [];
      searched = false;
      providerProperties = [];
      providerProperty = "";
      password = "";
      verification = "";
      factors = [];
      factorIndex = "";
      codeSent = false;
      calendarResults = [];
      calendarFileName = "";
      extraction = null;
      calendarDoor = "";
      calendarUrl = "";
      geminiKey = "";
      addingCalendar = false;
      selectedId = currentConnections[0]?.id ?? "";
      loadedConnection = "";
      connected = false;
      clearImage();
    });
  });
  $effect(() => {
    const source = selected;
    const key = (source?.id ?? "new") + "/" + scope;
    if (key === loadedConnection) return;
    loadedConnection = key;
    untrack(() => {
      password = "";
      verification = "";
      factors = [];
      codeSent = false;
      error = "";
      notice = "";
      records = [];
      searched = false;
      providerProperties = [];
      providerProperty = "";
      hotelId = String(source?.data.hotelId ?? "");
      const savedDevice =
        source?.data.deviceId ?? localStorage.getItem("oshost.kross.device");
      deviceId = savedDevice || randomUUID();
      if (!savedDevice) localStorage.setItem("oshost.kross.device", deviceId);
      connected = Boolean(source?.data.authenticated);
      if (source?.data.model) geminiModel = String(source.data.model);
      if (view === "kross" && connected)
        void perform(async (current) => {
          await loadProperties(source!.id, current);
        });
    });
  });
  $effect(() => () => {
    operation++;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  });
  async function perform(work: (current: () => boolean) => Promise<void>) {
    if (pending) return;
    const ticket = ++operation;
    pending = true;
    error = "";
    notice = "";
    const current = () => ticket === operation;
    try {
      await work(current);
    } catch (e) {
      if (current()) {
        error = (e as Error).message;
        if (
          (e as any).code === "KROSS_AUTH" ||
          /Kross (authentication rejected|login required)|KrossBooking rejected the credentials|saved login expired/i.test(
            error,
          )
        ) {
          connected = false;
          if (!codeSent) password = "";
        }
      }
    } finally {
      if (current()) pending = false;
    }
  }
  function cancel() {
    operation++;
    pending = false;
    password = "";
    verification = "";
    factors = [];
    codeSent = false;
    extraction = null;
    notice = l(
      "Cancelled. No access code was created.",
      "Annullato. Nessun codice di accesso è stato creato.",
    );
  }
  function client(id = selectedId) {
    return new KrossClient(
      (path, body) => api(`connections/${id}/request`, { path, body }),
      hotelId.trim(),
      deviceId,
    );
  }
  async function loadProperties(id: string, current: () => boolean) {
    const response = await client(id).properties();
    if (!current()) return;
    providerProperties = krossProperties(response);
    if (
      !providerProperties.some(
        (p) => String(p.id_property) === providerProperty,
      )
    )
      providerProperty = String(providerProperties[0]?.id_property ?? "");
    connected = true;
    if (!providerProperties.length)
      notice = l(
        "Connected, but this account has no accessible properties.",
        "Connesso, ma questo account non ha strutture accessibili.",
      );
  }
  async function finishConnection(id: string, current: () => boolean) {
    password = "";
    verification = "";
    factors = [];
    factorIndex = "";
    codeSent = false;
    connected = true;
    await reload();
    if (!current()) return;
    await loadProperties(id, current);
    if (current() && providerProperties.length)
      notice = l(
        "KrossBooking connected. Choose arrivals or search for a guest.",
        "KrossBooking collegato. Scegli gli arrivi o cerca un ospite.",
      );
  }
  async function login(current: () => boolean) {
    if (!hotelId.trim() || !username.trim() || !password)
      throw Error(
        l(
          "Enter the hotel ID, username and password.",
          "Inserisci ID hotel, nome utente e password.",
        ),
      );
    let id = selectedId;
    if (!id) {
      const saved = await api("connections", {
        propertyId,
        kind: "kross",
        name: "KrossBooking",
        secret: {},
        data: { hotelId: hotelId.trim(), deviceId },
      });
      if (!current()) return;
      id = saved.id;
      selectedId = id;
      // Keep the credentials in memory through parent reload and any 2FA challenge.
      // Persist the new record immediately so a failed sign-in can be retried.
      loadedConnection = id + "/" + scope;
      await reload();
      if (!current()) return;
    }
    const result = await client(id).login(username.trim(), password);
    if (!current()) return;
    if (result.authenticated) {
      await finishConnection(id, current);
      return;
    }
    if (result["2fa"]) {
      factors = result.devices ?? [];
      factorIndex = factors.length === 1 ? "0" : "";
      codeSent = false;
      if (!factors.length)
        throw Error(
          l(
            "No verification methods were returned. Contact your KrossBooking administrator.",
            "Nessun metodo di verifica disponibile. Contatta l’amministratore KrossBooking.",
          ),
        );
    } else
      throw Error(
        l(
          "KrossBooking did not confirm sign-in. Check your account details.",
          "KrossBooking non ha confermato l’accesso. Controlla i dati dell’account.",
        ),
      );
  }
  async function sendVerification(current: () => boolean) {
    if (factorIndex === "")
      throw Error(
        l("Choose a verification method.", "Scegli un metodo di verifica."),
      );
    const response = await client().requestTwoFactor(
      username.trim(),
      password,
      factors[Number(factorIndex)],
    );
    if (!current()) return;
    if (response.authenticated) {
      await finishConnection(selectedId, current);
      return;
    }
    codeSent = true;
    notice = l(
      "Verification code sent. Enter it below.",
      "Codice di verifica inviato. Inseriscilo qui sotto.",
    );
  }
  async function verify(current: () => boolean) {
    const result = await client().completeTwoFactor(
      username.trim(),
      password,
      factors[Number(factorIndex)],
      verification.trim(),
    );
    if (!current()) return;
    if (!result.authenticated)
      throw Error(
        l(
          "Verification was not accepted. Check the code and try again.",
          "Verifica non accettata. Controlla il codice e riprova.",
        ),
      );
    await finishConnection(selectedId, current);
  }
  async function listReservations(
    current: () => boolean,
    nextPage = 0,
    nextMode = mode,
  ) {
    if (!providerProperty)
      throw Error(
        l(
          "Choose a KrossBooking property.",
          "Scegli una struttura KrossBooking.",
        ),
      );
    if (nextMode === "search" && !searchTerm.trim())
      throw Error(
        l(
          "Enter a guest name or reservation number.",
          "Inserisci il nome dell’ospite o il numero di prenotazione.",
        ),
      );
    const response =
      nextMode === "search"
        ? await client().search({
            id_property: Number(providerProperty),
            query: searchTerm.trim(),
            page: nextPage,
          })
        : await client().arrivals(
            Number(providerProperty),
            arrivalDate,
            nextPage,
          );
    if (!current()) return;
    const result = krossReservations(response);
    records = result.items;
    hasNext = result.hasNextPage;
    page = nextPage;
    mode = nextMode;
    searched = true;
  }
  async function reviewReservation(item: any, current: () => boolean) {
    const id = Number(item.id_reservation ?? item.id);
    if (!Number.isFinite(id) || !id)
      throw Error(
        l(
          "This reservation has no valid identifier.",
          "Questa prenotazione non ha un identificativo valido.",
        ),
      );
    const result = await client().reservation(id);
    if (!current()) return;
    review(
      krossReservationDraft(
        result,
        {
          propertyId,
          timezone: property.timezone,
          checkIn: property.checkIn,
          checkOut: property.checkOut,
          doors: localDoors,
        },
        item,
      ),
    );
  }
  function review(value: Partial<AccessCodeDraft>) {
    onDraft({
      propertyId,
      label: "",
      notes: "",
      checkinLink: "",
      instructionsLink: "",
      grants: [],
      breakfast: null,
      ...value,
    });
  }
  async function removeConnection(current: () => boolean) {
    if (
      !selected ||
      !confirm(
        l(
          "Disconnect this shared provider for everyone in the team? Existing access codes will keep working.",
          "Disconnettere questo servizio condiviso per tutto il team? I codici di accesso esistenti continueranno a funzionare.",
        ),
      )
    )
      return;
    await api("connections/" + selected.id, undefined, "DELETE");
    if (!current()) return;
    selectedId = "";
    connected = false;
    records = [];
    providerProperties = [];
    password = "";
    await reload();
  }
  function parseCalendar(text: string) {
    const door = localDoors.find((d) => d.id === calendarDoor);
    if (!door)
      throw Error(
        l(
          "Choose the door this calendar belongs to.",
          "Scegli la porta associata al calendario.",
        ),
      );
    calendarResults = calendarDrafts(text, {
      propertyId,
      doorId: door.id,
      timezone: property.timezone,
      checkIn: property.checkIn,
      checkOut: property.checkOut,
      singleUse: door.singleUse,
    });
    if (!calendarResults.length)
      notice = l(
        "No upcoming events were found in this calendar.",
        "Nessun evento futuro trovato in questo calendario.",
      );
  }
  async function saveCalendar(current: () => boolean) {
    const r = await api("connections", {
      propertyId,
      kind: "ical",
      name: calendarName.trim() || l("Calendar", "Calendario"),
      secret: { url: calendarUrl.trim() },
      data: {},
    });
    if (!current()) return;
    calendarUrl = "";
    calendarName = "";
    selectedId = r.id;
    addingCalendar = false;
    await reload();
    notice = l(
      "Calendar saved. Fetch it when you need a draft.",
      "Calendario salvato. Caricalo quando ti serve una bozza.",
    );
  }
  async function fetchCalendar(current: () => boolean) {
    const r = await api(`connections/${selectedId}/request`, {});
    if (current()) parseCalendar(r.text);
  }
  async function readCalendar(file: File, current: () => boolean) {
    if (file.size > 4 * 1024 * 1024)
      throw Error(
        l(
          "Choose a calendar smaller than 4 MB.",
          "Scegli un calendario inferiore a 4 MB.",
        ),
      );
    const text = await file.text();
    if (current()) {
      calendarFileName = file.name;
      parseCalendar(text);
    }
  }
  async function saveGemini(current: () => boolean) {
    const r = await api("connections", {
      propertyId,
      kind: "gemini",
      name: "Gemini",
      secret: { key: geminiKey.trim() },
      data: { model: geminiModel.trim() },
    });
    if (!current()) return;
    geminiKey = "";
    selectedId = r.id;
    await reload();
    notice = l(
      "Gemini connected. Select an image to prepare a draft.",
      "Gemini collegato. Seleziona un’immagine per preparare una bozza.",
    );
  }
  function clearImage() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = "";
    imageFile = null;
    extraction = null;
    extractionBreakfast = undefined;
  }
  function chooseImage(file: File) {
    clearImage();
    imageFile = file;
    imageUrl = URL.createObjectURL(file);
  }
  async function extract(current: () => boolean) {
    if (!imageFile) return;
    const image = await resizeImage(imageFile);
    if (!current()) return;
    const r = await api(`connections/${selectedId}/request`, {
      image,
      mime: "image/jpeg",
      prompt:
        "Extract access details. Return JSON: label (guest name), start and end (ISO datetimes with timezone offset), doors (array of exact names), breakfastTotal (integer if known). Omit uncertain values; do not guess. Allowed doors: " +
        localDoors.map((d) => d.name).join(", "),
    });
    if (!current()) return;
    const parsed = parseExtraction(r.text);
    const completeDates =
      parsed.start &&
      parsed.end &&
      Number.isFinite(Date.parse(parsed.start)) &&
      Number.isFinite(Date.parse(parsed.end)) &&
      Date.parse(parsed.start) < Date.parse(parsed.end);
    extraction = {
      propertyId,
      label: parsed.label,
      notes: l(
        "Image extraction — verify every field before saving.",
        "Estrazione da immagine: verifica ogni campo prima di salvare.",
      ),
      grants: completeDates
        ? localDoors
            .filter((d) => parsed.doors.includes(d.name))
            .map((d) => ({
              doorId: d.id,
              start: new Date(parsed.start!).toISOString(),
              end: new Date(parsed.end!).toISOString(),
              singleUse: d.singleUse,
            }))
        : [],
      breakfast: null,
    };
    extractionBreakfast = parsed.breakfastTotal;
  }
  function dates(item: any) {
    return [item.arrival ?? item.start, item.departure ?? item.end]
      .filter(Boolean)
      .map((v) => String(v).slice(0, 10))
      .join(" → ");
  }
</script>

<section
  class="connectors"
  aria-label={l("Booking connectors", "Connettori prenotazioni")}
>
  {#if !propertyId}<div class="empty-state">
      <Plug size={32} />
      <h2>{l("Select a property first", "Seleziona prima una struttura")}</h2>
      <p class="muted">
        {l(
          "Each property has its own shared connections.",
          "Ogni struttura ha le proprie connessioni condivise.",
        )}
      </p>
    </div>
  {:else if view === "list"}
    <div class="intro">
      <h2>{l("Booking connectors", "Connettori prenotazioni")}</h2>
      <p class="muted">
        {l(
          "Bring guest details into a draft. You review and save every access code.",
          "Importa i dettagli degli ospiti in una bozza. Ogni codice viene controllato e salvato da te.",
        )}
      </p>
    </div>
    <div class="provider-list">
      {#each providers as provider (provider.id)}{@const saved =
          localConnections.filter((c) => c.kind === provider.id)}<button
          class="provider-row"
          onclick={() => (view = provider.id)}
        >
          <span class="provider-icon"><provider.icon size={22} /></span><span
            class="provider-copy"
            ><strong>{provider.name}</strong><small
              >{provider.id === "kross"
                ? l(
                    "Find a reservation and prefill guest access",
                    "Cerca una prenotazione e precompila l’accesso ospite",
                  )
                : provider.id === "ical"
                  ? l(
                      "Upload a calendar or connect a calendar URL",
                      "Carica un calendario o collega il suo URL",
                    )
                  : l(
                      "Extract guest details from an image",
                      "Estrai i dettagli degli ospiti da un’immagine",
                    )}</small
            ></span
          >
          {#if saved.length}<span
              class="status-dot"
              aria-label={l("Configured", "Configurato")}
            ></span>{/if}<ChevronRight size={18} />
        </button>{/each}
    </div>
  {:else}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
    {#if currentConnections.length > 1}<label
        >{l("Connection", "Connessione")}<select
          bind:value={selectedId}
          disabled={pending}
          aria-label={l("Connection", "Connessione")}
          >{#each currentConnections as c (c.id)}<option value={c.id}
              >{c.name}</option
            >{/each}</select
        ></label
      >{/if}
    {#if view === "kross"}
      {#if connected}<div class="connected-line">
          <Check size={18} /><strong>{l("Connected", "Collegato")}</strong><span
            >{hotelId}</span
          >{#if owner}<button
              class="text-action"
              disabled={pending}
              onclick={() => perform(removeConnection)}
              >{l("Disconnect", "Disconnetti")}</button
            >{/if}
        </div>
        <section class="connector-form">
          <label
            >{l("KrossBooking property", "Struttura KrossBooking")}<select
              bind:value={providerProperty}
              disabled={pending}
              aria-label={l("KrossBooking property", "Struttura KrossBooking")}
              onchange={() => {
                records = [];
                searched = false;
                page = 0;
              }}
              ><option value=""
                >{l("Select a property", "Seleziona una struttura")}</option
              >{#each providerProperties as p (p.id_property)}<option
                  value={String(p.id_property)}
                  >{p.name ?? p.name_property ?? p.id_property}</option
                >{/each}</select
            ></label
          >
          {#if !providerProperties.length}<button
              disabled={pending}
              onclick={() =>
                perform((current) => loadProperties(selectedId, current))}
              >{l("Load properties", "Carica strutture")}</button
            >{/if}
          <form
            class="search-row"
            onsubmit={(e) => {
              e.preventDefault();
              void perform((current) =>
                listReservations(current, 0, "arrivals"),
              );
            }}
          >
            <label
              >{l("Arrivals date", "Data arrivi")}<input
                type="date"
                bind:value={arrivalDate}
                required
                disabled={pending}
              /></label
            ><button class="primary" disabled={pending || !providerProperty}
              >{l("Find arrivals", "Cerca arrivi")}</button
            >
          </form>
          <form
            class="search-row"
            onsubmit={(e) => {
              e.preventDefault();
              void perform((current) => listReservations(current, 0, "search"));
            }}
          >
            <label
              >{l("Search reservations", "Cerca prenotazioni")}<input
                placeholder={l(
                  "Guest name or reservation number",
                  "Nome ospite o numero prenotazione",
                )}
                bind:value={searchTerm}
                disabled={pending}
              /></label
            ><button
              disabled={pending || !providerProperty || !searchTerm.trim()}
              aria-label={l("Search", "Cerca")}><Search size={18} /></button
            >
          </form>
        </section>
        {#if searched}<div class="results-heading">
            <h3>{l("Reservations", "Prenotazioni")}</h3>
            <small>{l("Page", "Pagina")} {page + 1}</small>
          </div>
          <div class="result-list">
            {#each records as record, i (record.id_reservation ?? record.id ?? i)}<button
                class="result-row"
                disabled={pending}
                onclick={() =>
                  perform((current) => reviewReservation(record, current))}
                ><span
                  ><strong
                    >{record.label ??
                      record.name ??
                      l("Guest details", "Dettagli ospite")}</strong
                  ><small>{dates(record)}</small></span
                ><span class="review-label"
                  >{l("Review draft", "Controlla bozza")}
                  <ChevronRight size={16} /></span
                ></button
              >{:else}<div class="empty-result">
                {l(
                  "No reservations found. Try another date or search.",
                  "Nessuna prenotazione trovata. Prova un’altra data o ricerca.",
                )}
              </div>{/each}
          </div>
          <div class="pagination">
            <button
              disabled={pending || page === 0}
              onclick={() =>
                perform((current) => listReservations(current, page - 1))}
              ><ArrowLeft size={16} />{l("Previous", "Precedente")}</button
            ><button
              disabled={pending || !hasNext}
              onclick={() =>
                perform((current) => listReservations(current, page + 1))}
              >{l("Next", "Successiva")}<ArrowRight size={16} /></button
            >
          </div>{/if}
      {:else if owner}
        <p class="muted">
          {l(
            "Use your KrossBooking credentials. Your password is used for sign-in only and is never saved.",
            "Usa le credenziali KrossBooking. La password viene usata solo per l’accesso e non viene mai salvata.",
          )}
        </p>
        <form
          class="connector-form"
          onsubmit={(e) => {
            e.preventDefault();
            void perform(login);
          }}
        >
          <label
            >{l("Hotel ID", "ID hotel")}<input
              bind:value={hotelId}
              required
              autocomplete="off"
              disabled={pending || factors.length > 0}
            /></label
          >
          <label
            >{l("Username", "Nome utente")}<input
              bind:value={username}
              required
              autocomplete="username"
              disabled={pending || factors.length > 0}
            /></label
          >
          <label
            >{l("Password", "Password")}<input
              type="password"
              bind:value={password}
              required
              autocomplete="current-password"
              disabled={pending || factors.length > 0}
            /></label
          >
          {#if !factors.length}<button
              class="primary"
              disabled={pending ||
                !hotelId.trim() ||
                !username.trim() ||
                !password}
              >{pending
                ? l("Connecting…", "Connessione…")
                : l("Connect KrossBooking", "Collega KrossBooking")}</button
            >{/if}
        </form>
        {#if selected && !factors.length}<button
            class="text-action"
            disabled={pending}
            onclick={() => perform(removeConnection)}
            >{l(
              "Remove saved connection",
              "Rimuovi connessione salvata",
            )}</button
          >{/if}
        {#if factors.length}<section class="connector-form verification">
            <h3>{l("Verify your identity", "Verifica la tua identità")}</h3>
            <label
              >{l("Verification method", "Metodo di verifica")}<select
                bind:value={factorIndex}
                disabled={pending}
                aria-label={l("Verification method", "Metodo di verifica")}
                onchange={() => {
                  codeSent = false;
                  verification = "";
                }}
                ><option value=""
                  >{l("Choose a method", "Scegli un metodo")}</option
                >{#each factors as factor, i (i)}<option value={String(i)}
                    >{factor["2fa_device"] ?? factor["2fa_type"]}</option
                  >{/each}</select
              ></label
            ><button
              disabled={pending || factorIndex === ""}
              onclick={() => perform(sendVerification)}
              >{codeSent
                ? l("Send another code", "Invia un altro codice")
                : l(
                    "Send verification code",
                    "Invia codice di verifica",
                  )}</button
            >{#if codeSent}<form
                class="connector-form"
                onsubmit={(e) => {
                  e.preventDefault();
                  void perform(verify);
                }}
              >
                <label
                  >{l("Verification code", "Codice di verifica")}<input
                    bind:value={verification}
                    autocomplete="one-time-code"
                    inputmode="numeric"
                    required
                    disabled={pending}
                  /></label
                ><button
                  class="primary"
                  disabled={pending || !verification.trim()}
                  >{l("Verify and connect", "Verifica e collega")}</button
                >
              </form>{/if}<button disabled={pending} onclick={cancel}
              >{t("Cancel")}</button
            >
          </section>{/if}
      {:else}<div class="empty-result">
          <p>
            {l(
              "An owner needs to connect KrossBooking before the team can use it.",
              "Un proprietario deve collegare KrossBooking prima che il team possa usarlo.",
            )}
          </p>
        </div>{/if}
    {:else if view === "ical"}
      <p class="muted">
        {l(
          "Choose the door for these events. All imported details stay in a draft until you save.",
          "Scegli la porta per questi eventi. I dettagli importati restano in bozza finché non salvi.",
        )}
      </p>
      <label
        >{l("Calendar door", "Porta del calendario")}<select
          bind:value={calendarDoor}
          disabled={pending}
          aria-label={l("Calendar door", "Porta del calendario")}
          onchange={() => {
            calendarResults = [];
            calendarFileName = "";
          }}
          ><option value="">{l("Choose a door", "Scegli una porta")}</option
          >{#each localDoors as door (door.id)}<option value={door.id}
              >{door.name}</option
            >{/each}</select
        ></label
      >
      <section class="connector-form">
        <h3>{l("Upload a calendar", "Carica un calendario")}</h3>
        <label
          >{l("Calendar file (.ics)", "File calendario (.ics)")}<input
            type="file"
            accept=".ics,text/calendar"
            disabled={pending || !calendarDoor}
            onchange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (f) void perform((current) => readCalendar(f, current));
            }}
          /></label
        >{#if calendarFileName}<small>{calendarFileName}</small>{/if}
      </section>
      <section class="connector-form separated">
        <div class="results-heading">
          <h3>{l("Connected calendars", "Calendari collegati")}</h3>
          {#if owner && selected && !addingCalendar}<button
              class="text-action"
              onclick={() => (addingCalendar = true)}
              ><Plus size={16} />{l("Add", "Aggiungi")}</button
            >{/if}
        </div>
        {#if selected && !addingCalendar}<div class="connected-line">
            <CalendarDays size={18} /><strong>{selected.name}</strong
            >{#if owner}<button
                class="text-action"
                disabled={pending}
                onclick={() => perform(removeConnection)}
                >{l("Disconnect", "Disconnetti")}</button
              >{/if}
          </div>
          <button
            class="primary"
            disabled={pending || !calendarDoor}
            onclick={() => perform(fetchCalendar)}
            >{l("Fetch calendar now", "Carica calendario ora")}</button
          >
        {:else if owner}<form
            class="connector-form"
            onsubmit={(e) => {
              e.preventDefault();
              void perform(saveCalendar);
            }}
          >
            <label
              >{l("Calendar name", "Nome calendario")}<input
                bind:value={calendarName}
                placeholder={l("e.g. Room 1", "es. Camera 1")}
                required
                disabled={pending}
              /></label
            ><label
              >{l("Calendar URL", "URL calendario")}<input
                type="url"
                bind:value={calendarUrl}
                placeholder="https://…"
                required
                disabled={pending}
              /></label
            ><small
              >{l(
                "The private URL is stored encrypted and is never displayed to staff.",
                "L’URL privato viene salvato cifrato e non viene mai mostrato allo staff.",
              )}</small
            >
            <div class="actions">
              <button class="primary" disabled={pending || !calendarUrl.trim()}
                >{l("Save calendar", "Salva calendario")}</button
              >{#if selected}<button
                  type="button"
                  onclick={() => (addingCalendar = false)}>{t("Cancel")}</button
                >{/if}
            </div>
          </form>
        {:else}<p class="muted">
            {l(
              "An owner can connect a calendar URL. You can upload a file above.",
              "Un proprietario può collegare un URL calendario. Puoi caricare un file qui sopra.",
            )}
          </p>{/if}
      </section>
      {#if calendarResults.length}<div class="results-heading">
          <h3>{l("Calendar events", "Eventi del calendario")}</h3>
          <small>{calendarResults.length}</small>
        </div>
        <div class="result-list">
          {#each calendarResults as draft, i (i)}<button
              class="result-row"
              onclick={() => review(draft)}
              ><span
                ><strong
                  >{draft.label ||
                    l("Guest name missing", "Nome ospite mancante")}</strong
                ><small
                  >{draft.grants?.[0]?.start.slice(0, 10)} → {draft.grants?.[0]?.end.slice(
                    0,
                    10,
                  )}</small
                ></span
              ><span class="review-label"
                >{l("Review draft", "Controlla bozza")}<ChevronRight
                  size={16}
                /></span
              ></button
            >{/each}
        </div>{/if}
    {:else if view === "gemini"}
      {#if !selected && owner}<p class="muted">
          {l(
            "Connect your team’s Gemini key to extract details from screenshots.",
            "Collega la chiave Gemini del team per estrarre dettagli dagli screenshot.",
          )}
        </p>
        <form
          class="connector-form"
          onsubmit={(e) => {
            e.preventDefault();
            void perform(saveGemini);
          }}
        >
          <label
            >{l("Gemini API key", "Chiave API Gemini")}<input
              type="password"
              bind:value={geminiKey}
              autocomplete="off"
              required
              disabled={pending}
            /></label
          ><label
            >{l("Model", "Modello")}<input
              bind:value={geminiModel}
              required
              disabled={pending}
            /></label
          ><small
            >{l(
              "The key is encrypted on the server and never returned to the browser.",
              "La chiave viene cifrata sul server e non viene mai restituita al browser.",
            )}</small
          ><button
            class="primary"
            disabled={pending || !geminiKey.trim() || !geminiModel.trim()}
            >{l("Connect Gemini", "Collega Gemini")}</button
          >
        </form>
      {:else if !selected}<p class="empty-result">
          {l(
            "An owner needs to connect Gemini for the team first.",
            "Un proprietario deve prima collegare Gemini per il team.",
          )}
        </p>
      {:else}<div class="connected-line">
          <Check size={18} /><strong>{l("Connected", "Collegato")}</strong><span
            >{selected.data.model ?? "Gemini"}</span
          >{#if owner}<button
              class="text-action"
              disabled={pending}
              onclick={() => perform(removeConnection)}
              >{l("Disconnect", "Disconnetti")}</button
            >{/if}
        </div>
        <p class="muted">
          {l(
            "Select an image, then extract its details. The image is sent to Gemini and is not saved by oshost. Review all results before creating a code.",
            "Seleziona un’immagine, poi estrai i dettagli. L’immagine viene inviata a Gemini e non viene salvata da oshost. Controlla i risultati prima di creare un codice.",
          )}
        </p>
        <div class="connector-form">
          <label
            >{l("Screenshot", "Screenshot")}<input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={pending}
              onchange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (f) chooseImage(f);
              }}
            /></label
          >{#if imageUrl}<img
              class="screenshot-preview"
              src={imageUrl}
              alt={l("Selected screenshot", "Screenshot selezionato")}
            />
            <div class="actions">
              <button
                class="primary"
                disabled={pending}
                onclick={() => perform(extract)}
                >{pending
                  ? l("Extracting…", "Estrazione…")
                  : l("Extract details", "Estrai dettagli")}</button
              ><button
                onclick={() => {
                  cancel();
                  clearImage();
                }}><X size={16} />{t("Cancel")}</button
              >
            </div>{/if}
        </div>
        {#if extraction}<section class="extraction-preview">
            <h3>
              {l("Review extracted details", "Controlla i dettagli estratti")}
            </h3>
            <p>
              <strong
                >{extraction.label ||
                  l("Guest name missing", "Nome ospite mancante")}</strong
              >
            </p>
            <p>
              {extraction.grants?.length ?? 0}
              {l("matched doors", "porte corrispondenti")}
            </p>
            {#if extractionBreakfast !== undefined}<p>
                {l("Breakfast quantity found", "Colazioni rilevate")}: {extractionBreakfast}.
                {l(
                  "Choose breakfast dates in the draft.",
                  "Scegli le date della colazione nella bozza.",
                )}
              </p>{/if}<small
              >{l(
                "Missing or uncertain fields need manual completion. Nothing has been saved yet.",
                "Completa manualmente i campi mancanti o incerti. Non è stato ancora salvato nulla.",
              )}</small
            ><button class="primary" onclick={() => review(extraction!)}
              >{l("Review draft", "Controlla bozza")}</button
            >
          </section>{/if}{/if}
    {/if}
    {#if pending}<p class="muted" role="status">
        {l("Working…", "Operazione in corso…")}
      </p>{/if}
  {/if}
</section>

<style>
  .connectors {
    max-width: 44rem;
    margin: 0 auto;
  }
  .intro {
    padding: 0 0 1.25rem;
  }
  .intro h2 {
    margin-bottom: 0.5rem;
  }
  .intro p {
    margin: 0;
  }
  .provider-list,
  .result-list {
    border-top: 1px solid var(--border);
  }
  .provider-row,
  .result-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
    text-align: left;
    padding: 1.15rem 0.25rem;
    color: inherit;
  }
  .provider-row:hover,
  .result-row:hover {
    background: var(--muted);
  }
  .provider-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.75rem;
    background: var(--muted);
    color: var(--muted-foreground);
  }
  .provider-copy,
  .result-row > span:first-child {
    display: grid;
    gap: 0.3rem;
    flex: 1;
    min-width: 0;
  }
  .provider-copy small,
  .result-row small {
    line-height: 1.45;
    font-weight: 400;
  }
  .status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--primary);
  }
  .connector-form {
    display: grid;
    gap: 1rem;
    margin: 1.5rem 0;
  }
  .connector-form .connector-form {
    margin: 0;
  }
  .connector-form h3 {
    margin: 0;
  }
  .connected-line {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    padding: 1rem 0;
    border-bottom: 1px solid var(--border);
  }
  .connected-line span {
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }
  .connected-line .text-action {
    margin-left: auto;
  }
  .text-action {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border: 0;
    background: transparent;
    padding: 0.3rem;
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }
  .search-row {
    display: flex;
    align-items: end;
    gap: 0.6rem;
  }
  .search-row label {
    flex: 1;
    min-width: 0;
  }
  .search-row button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
  }
  .results-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin: 1.5rem 0 0.6rem;
  }
  .results-heading h3 {
    margin: 0;
  }
  .review-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    flex-shrink: 0;
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 1rem;
  }
  .pagination button,
  .actions button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .empty-result {
    padding: 1.5rem 0;
    color: var(--muted-foreground);
    line-height: 1.6;
  }
  .separated,
  .verification {
    border-top: 1px solid var(--border);
    padding-top: 1.25rem;
  }
  .actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .screenshot-preview {
    display: block;
    max-width: 100%;
    max-height: 240px;
    object-fit: contain;
    border-radius: 0.5rem;
  }
  .extraction-preview {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
  }
  .extraction-preview p {
    margin: 0;
  }
  .extraction-preview h3 {
    margin: 0;
  }
  @media (max-width: 480px) {
    .review-label {
      font-size: 0;
      gap: 0;
    }
    .provider-row {
      gap: 0.75rem;
    }
    .provider-copy small {
      font-size: 0.78rem;
    }
    .search-row {
      align-items: end;
    }
    .search-row button {
      font-size: 0.82rem;
      padding: 0.6rem 0.7rem;
    }
  }
</style>
