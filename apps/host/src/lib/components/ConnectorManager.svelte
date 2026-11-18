<script lang="ts">
  import { hostStorage } from "$lib/demo-storage";
  import {
    contactName,
    sampleContact,
    saveGuestContact,
    type GuestContact,
  } from "$lib/guest-contact";
  import {
    connectorProviders as providers,
    matchesKind,
  } from "$lib/connector-providers";
  import KrossPlanner from "$lib/components/KrossPlanner.svelte";
  import DateInput from "$lib/components/DateInput.svelte";
  import {
    formatDisplayDate,
    formatDisplayDateTime,
  } from "$lib/date-settings.svelte";
  import FeedbackToast from "$lib/components/FeedbackToast.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import { guestLinkDefaults } from "../../../../../shared/draft-defaults";
  import { untrack } from "svelte";
  import {
    CalendarDays,
    ChevronRight,
    Check,
    Plug,
    Search,
    ArrowLeft,
    ArrowRight,
    X,
    Plus,
    DoorOpen,
    FileUp,
    ShieldCheck,
    LoaderCircle,
    Settings,
    Contact,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import * as Alert from "$lib/components/ui/alert";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";
  import * as NativeSelect from "$lib/components/ui/native-select";
  import { Separator } from "$lib/components/ui/separator";
  import { hostLanguage, t } from "$lib/i18n.svelte";
  import {
    KrossClient,
    calendarDrafts,
    parseExtraction,
    resizeImage,
    krossProperties,
    krossReservations,
    krossReservationDraft,
    reservationBreakfast,
    krossSourceRooms,
    reservationDate,
    type CalendarAccessDraft,
  } from "../../../../../shared/connectors";
  import {
    aiProviders,
    type AiModel,
    type AiProvider,
  } from "../../../../../shared/ai-providers";
  import * as Item from "$lib/components/ui/item";
  import * as Accordion from "$lib/components/ui/accordion";
  import {
    localDate,
    type AccessCodeDraft,
  } from "../../../../../shared/schema";
  type View = "list" | "kross" | "ical" | "ai";
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
    contactNameFormat,
    savePreferences,
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
    contactNameFormat: string;
    savePreferences: (changes: { contactNameFormat?: string }) => Promise<void>;
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
    calendarResults = $state<CalendarAccessDraft[]>([]),
    calendarFileName = $state(""),
    calendarText = $state("");
  let aiProvider = $state<AiProvider | "">(""),
    aiKey = $state(""),
    aiModels = $state<AiModel[]>([]),
    aiModel = $state(""),
    imageFile = $state<File | null>(null),
    imageUrl = $state(""),
    extraction = $state<Partial<AccessCodeDraft> | null>(null),
    extractionBreakfast = $state<number | undefined>();
  let preview = $state<{
    draft: AccessCodeDraft;
    details: [string, string][];
    source: string;
    contact?: GuestContact;
  } | null>(null);
  let settingsOpen = $state(false),
    formatDraft = $state("");
  let formatInput = $state<HTMLInputElement | null>(null);
  function insertPlaceholder(key: string) {
    const input = formatInput;
    if (!input) return;
    const start = input.selectionStart ?? formatDraft.length;
    const end = input.selectionEnd ?? start;
    const token = "{" + key + "}";
    if (formatDraft.length - (end - start) + token.length > 180) return;
    input.setRangeText(token, start, end, "end");
    formatDraft = input.value;
    input.focus();
  }
  const formatValid = $derived(
    formatDraft.trim().length > 0 &&
      !/[{}]/.test(
        formatDraft.replace(
          /\{(name|arrival|departure|dates|rooms|property|reservation)\}/g,
          "",
        ),
      ),
  );
  let extractionDetails = $state<[string, string][]>([]);
  let screenshotInput = $state<HTMLInputElement | null>(null);
  let scope = "",
    loadedConnection = "",
    operation = 0;
  const localConnections = $derived(
    connections.filter((c) => c.property_id === propertyId),
  );
  const currentConnections = $derived(
    localConnections.filter((c) => matchesKind(c, view)),
  );
  const selected = $derived(
    currentConnections.find((c) => c.id === selectedId),
  );
  const localDoors = $derived(doors.filter((d) => d.propertyId === propertyId));
  $effect(() => {
    const next = propertyId + "/" + view;
    if (next === scope) return;
    scope = next;
    untrack(() => {
      operation++;
      preview = null;
      pending = false;
      error = "";
      notice = "";
      records = [];
      searched = false;
      providerProperties = [];
      providerProperty = "";
      preview = null;
      password = "";
      verification = "";
      factors = [];
      factorIndex = "";
      codeSent = false;
      calendarResults = [];
      calendarFileName = "";
      calendarText = "";
      extraction = null;
      calendarDoor = "";
      calendarUrl = "";
      aiProvider = "";
      aiKey = "";
      resetAiModels();
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
      deviceId = source?.data.deviceId ?? "";
      hostStorage.removeItem("guestin.kross.device");
      connected = Boolean(source?.data.authenticated);
      if (view === "ai") clearImage();
      if (view === "ical") {
        calendarDoor = localDoors.some((d) => d.id === source?.data.doorId)
          ? String(source!.data.doorId)
          : "";
        calendarResults = [];
        calendarFileName = "";
        calendarText = "";
      }
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
  async function loadPlannerRange(start: string, end: string) {
    const connection = selectedId;
    try {
      return await client().plannerRange(
        Number(providerProperty),
        start,
        end,
        hostLanguage.current,
      );
    } catch (e) {
      if (
        view === "kross" &&
        selectedId === connection &&
        (e as any).code === "KROSS_AUTH"
      ) {
        connected = false;
        error = (e as Error).message;
      }
      throw e;
    }
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
      notice = l("KrossBooking connected.", "KrossBooking collegato.");
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
        data: { hotelId: hotelId.trim() },
      });
      if (!current()) return;
      id = saved.id;
      selectedId = id;
      deviceId = saved.data.deviceId;
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
    // Planner bars can be clipped at the edge of the displayed month.
    const summary =
      item.roomId !== undefined
        ? { ...item, arrival: undefined, departure: undefined }
        : item;
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
    const detail = result?.data?.reservation ?? result?.reservation ?? result;
    const rooms = krossSourceRooms(detail, summary).join(", ");
    const phone =
      [
        detail.tel,
        detail.phone,
        detail.mobile,
        summary.tel,
        summary.phone,
        summary.mobile,
      ]
        .map((v) => String(v ?? "").trim())
        .find(Boolean) ?? "";
    const email = String(
      detail.email ||
        detail.email_guest ||
        summary.email ||
        summary.email_guest ||
        "",
    ).trim();
    const contactDate = (value: unknown) => {
      const date = reservationDate(value);
      return date ? formatDisplayDate(date) : "";
    };
    const arrival = contactDate(detail.arrival ?? summary.arrival);
    const departure = contactDate(detail.departure ?? summary.departure);
    const plannerRoom = item.roomNames?.join(", ") ?? "";
    const missing = l("Not supplied", "Non disponibile");
    const channel =
      detail.channel ||
      detail.name_channel ||
      summary.channel ||
      summary.name_channel ||
      detail.cod_channel ||
      summary.cod_channel;
    const fields = { ...(item.roomId === undefined ? summary : {}), ...detail };
    const extraDetails: [string, string][] = [];
    function addField(label: string, value: unknown) {
      if (value && typeof value === "object" && Object.keys(value).length) {
        for (const [key, child] of Object.entries(value)) {
          const part = Array.isArray(value)
            ? Number(key) + 1
            : key.replaceAll("_", " ");
          addField(label + " · " + part, child);
        }
      } else {
        extraDetails.push([
          label,
          value == null || typeof value === "object" || value === ""
            ? missing
            : String(value),
        ]);
      }
    }
    const fieldNames: Record<string, string> = {
      cod_reservation: l("Booking reference", "Riferimento prenotazione"),
      date_reservation: l("Booked on", "Data prenotazione"),
      name_reservation_status: l("Reservation status", "Stato prenotazione"),
      n_rooms: l("Number of rooms", "Numero di camere"),
      nights: l("Nights", "Notti"),
      rooms: l("Rooms", "Camere"),
      cod_channel: l("Channel code", "Codice canale"),
      link_guest_portal: l("Guest portal link", "Link portale ospite"),
      link_check_in_instructions: l(
        "Check-in instructions link",
        "Link istruzioni check-in",
      ),
    };
    const displayed = new Set([
      "id_reservation",
      "label",
      "arrival",
      "departure",
      "n_guests",
      "notes",
      "tel",
      "email",
    ]);
    for (const [key, value] of Object.entries(fields)) {
      if (
        !displayed.has(key) &&
        !(key === "channel" && value === channel && typeof value !== "object")
      )
        addField(
          Object.hasOwn(fieldNames, key)
            ? fieldNames[key]
            : key.replaceAll("_", " "),
          value,
        );
    }
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
        summary,
      ),
      [
        [l("Reservation number", "Numero prenotazione"), String(id)],
        [
          l("Booking source", "Canale di prenotazione"),
          channel && typeof channel === "object"
            ? String(channel.name || channel.label || missing)
            : String(channel || missing),
        ],
        [l("Phone", "Telefono"), phone],
        [
          l("Guests", "Ospiti"),
          String(detail.n_guests || summary.n_guests || missing),
        ],
        [
          l("Arrival", "Arrivo"),
          String(detail.arrival ?? summary.arrival ?? ""),
        ],
        [
          l("Departure", "Partenza"),
          String(detail.departure ?? summary.departure ?? ""),
        ],
        [l("Source rooms", "Camere della prenotazione"), rooms],
        [
          l("Planner room", "Camera nel planner"),
          plannerRoom !== rooms ? plannerRoom : "",
        ],
        [l("Email", "Email"), email],
        [
          l("Reservation notes", "Note prenotazione"),
          String(
            detail.notes || detail.note || summary.notes || summary.note || "",
          ),
        ],
        ...extraDetails,
      ],
      phone
        ? {
            phone,
            email,
            fields: {
              name: String(detail.label || summary.label || ""),
              arrival,
              departure,
              dates: [arrival, departure].filter(Boolean).join(" – "),
              rooms,
              property: property.name ?? "",
              reservation: String(id),
            },
          }
        : undefined,
    );
  }
  function review(
    value: Partial<AccessCodeDraft>,
    details: [string, string][] = [],
    contact?: GuestContact,
  ) {
    preview = {
      source: providers.find((p) => p.id === view)?.name ?? "",
      details,
      contact,
      draft: {
        propertyId,
        label: "",
        notes: "",
        grants: [],
        breakfast: null,
        ...value,
        ...guestLinkDefaults(property, value),
      },
    };
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
    const results = calendarDrafts(text, {
      propertyId,
      doorId: door?.id ?? "",
      timezone: property.timezone,
      checkIn: property.checkIn,
      checkOut: property.checkOut,
      singleUse: door?.singleUse ?? false,
    });
    calendarText = text;
    calendarResults = results;
    if (!calendarResults.length)
      notice = l(
        "No upcoming events were found in this calendar.",
        "Nessun evento futuro trovato in questo calendario.",
      );
  }
  function mapCalendarDoor(event: Event) {
    calendarDoor = (event.currentTarget as HTMLSelectElement).value;
    if (calendarText) parseCalendar(calendarText);
  }
  function reviewCalendar(value: CalendarAccessDraft) {
    const door = localDoors.find((d) => d.id === calendarDoor);
    if (!door) return;
    const { calendarDetails, ...draft } = value;
    review(
      {
        ...draft,
        grants: value.grants?.map((grant) => ({
          ...grant,
          doorId: door.id,
          singleUse: door.singleUse,
        })),
      },
      calendarDetails
        ? [
            [l("Calendar event", "Evento calendario"), calendarDetails.uid],
            [
              l("Calendar start", "Inizio calendario"),
              calendarSourceDate(calendarDetails.start),
            ],
            [
              l("Calendar end", "Fine calendario"),
              calendarSourceDate(calendarDetails.end),
            ],
            [l("Description", "Descrizione"), calendarDetails.description],
            [l("Location", "Luogo"), calendarDetails.location],
            [
              l("Date interpretation", "Interpretazione date"),
              calendarDetails.allDay
                ? l(
                    "All-day event. The calendar end is exclusive; review the proposed access times below.",
                    "Evento giornaliero. La fine calendario è esclusiva: controlla gli orari di accesso proposti sotto.",
                  )
                : l(
                    "Timed event; access times use the structure timezone.",
                    "Evento con orari; gli accessi usano il fuso della struttura.",
                  ),
            ],
          ]
        : [],
    );
  }
  function calendarSourceDate(value: string) {
    return (
      formatDisplayDate(value.slice(0, 10)) +
      (value.length > 10 ? " " + value.slice(11, 16) : "") +
      (value.endsWith("Z") ? " UTC" : "")
    );
  }
  function calendarDates(value: Partial<AccessCodeDraft>) {
    const grant = value.grants?.[0];
    if (!grant) return "";
    return (
      formatDisplayDate(grant.start, property.timezone) +
      " → " +
      formatDisplayDate(grant.end, property.timezone)
    );
  }

  async function saveCalendar(current: () => boolean) {
    const r = await api("connections", {
      propertyId,
      kind: "ical",
      name: calendarName.trim() || l("Calendar", "Calendario"),
      secret: { url: calendarUrl.trim() },
      data: calendarDoor ? { doorId: calendarDoor } : {},
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
    if (current()) {
      parseCalendar(r.text);
      calendarFileName = "";
    }
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
      parseCalendar(text);
      calendarFileName = file.name;
    }
  }
  function resetAiModels() {
    aiModel = "";
    aiModels = [];
    error = "";
  }
  async function fetchAiModels(current: () => boolean) {
    const result = await api("connections/ai-models", {
      provider: aiProvider,
      key: aiKey.trim(),
    });
    if (!current()) return;
    aiModels = result.models;
    if (!aiModels.some((model) => model.id === aiModel)) aiModel = "";
    if (!aiModels.length)
      throw Error(
        l(
          "The provider returned no models for this token.",
          "Il servizio non ha restituito modelli per questo token.",
        ),
      );
  }
  async function saveAi(current: () => boolean) {
    const result = await api("connections", {
      propertyId,
      kind: "ai",
      name: aiProvider ? aiProviders[aiProvider] : "AI",
      secret: { key: aiKey.trim() },
      data: { provider: aiProvider, model: aiModel },
    });
    if (!current()) return;
    aiKey = "";
    resetAiModels();
    await reload();
    if (!current()) return;
    selectedId = result.id;
    notice = l(
      "AI connected. Select an image to prepare a draft.",
      "AI collegata. Seleziona un’immagine per preparare una bozza.",
    );
  }
  function clearImage(resetInput = true) {
    if (resetInput && screenshotInput) screenshotInput.value = "";
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = "";
    imageFile = null;
    extraction = null;
    extractionBreakfast = undefined;
    extractionDetails = [];
  }
  function chooseImage(file: File) {
    clearImage(false);
    imageFile = file;
    imageUrl = URL.createObjectURL(file);
  }
  async function extract(current: () => boolean) {
    if (!imageFile) return;
    extraction = null;
    const image = await resizeImage(imageFile);
    if (!current()) return;
    const r = await api(`connections/${selectedId}/request`, {
      image,
      mime: "image/jpeg",
      prompt:
        "Extract access details. Return JSON: label (guest name), start and end (ISO datetimes with timezone offset), doors (array of exact names), guestCount (total number of guests if stated), breakfastTotal (integer if known). Omit uncertain values; do not guess. Allowed doors: " +
        localDoors.map((d) => d.name).join(", "),
    });
    if (!current()) return;
    let parsed: ReturnType<typeof parseExtraction>;
    try {
      parsed = parseExtraction(r.text);
    } catch {
      throw Error(
        l(
          "The model did not return usable details. Try again or use a different image-capable model.",
          "Il modello non ha restituito dettagli utilizzabili. Riprova o usa un altro modello che supporta le immagini.",
        ),
      );
    }
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
    const stayDate = (value: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? reservationDate(value)
        : localDate(property.timezone, new Date(value));
    if (completeDates)
      extraction.breakfast = reservationBreakfast(
        stayDate(parsed.start!),
        stayDate(parsed.end!),
        parsed.guestCount,
        parsed.breakfastTotal,
      );
    extractionBreakfast = parsed.breakfastTotal;
    extractionDetails = [
      [l("Source image", "Immagine originale"), imageFile.name],
      [l("Extracted arrival", "Arrivo rilevato"), parsed.start ?? ""],
      [l("Extracted departure", "Partenza rilevata"), parsed.end ?? ""],
      [l("Extracted doors", "Porte rilevate"), parsed.doors.join(", ")],
      [l("Guests", "Ospiti"), String(parsed.guestCount ?? "")],
      [
        l("Breakfast quantity found", "Colazioni rilevate"),
        parsed.breakfastTotal === undefined
          ? ""
          : String(parsed.breakfastTotal),
      ],
    ];
  }
  function dates(item: any) {
    return [item.arrival ?? item.start, item.departure ?? item.end]
      .filter(Boolean)
      .map((v) => String(v).slice(0, 10))
      .join(" → ");
  }
</script>

<section
  class="grid w-full min-w-0 gap-6"
  aria-label={l("Booking connectors", "Connettori prenotazioni")}
>
  {#if view === "kross"}
    <div class="flex justify-end">
      <Button
        size="icon"
        variant="outline"
        aria-label={l("Contact settings", "Impostazioni contatto")}
        onclick={() => {
          formatDraft = contactNameFormat;
          settingsOpen = true;
        }}><Settings /></Button
      >
    </div>
  {/if}
  {#if !propertyId}
    <Card.Root
      ><Card.Content class="flex flex-col items-center gap-3 py-8 text-center">
        <Plug class="size-8 text-muted-foreground" />
        <h2 class="text-lg font-semibold">
          {l("Select a property first", "Seleziona prima una struttura")}
        </h2>
        <p class="text-sm text-muted-foreground">
          {l(
            "Each property has its own shared connections.",
            "Ogni struttura ha le proprie connessioni condivise.",
          )}
        </p>
      </Card.Content></Card.Root
    >
  {:else if view === "list"}
    <p class="max-w-xl text-sm leading-6 text-muted-foreground">
      {l(
        "Start with the guest details you already have. Every import opens an editable draft; you choose when to create the access code.",
        "Parti dai dettagli degli ospiti che hai già. Ogni importazione apre una bozza modificabile: scegli tu quando creare il codice di accesso.",
      )}
    </p>
    <Item.Group class="workspace-list">
      {#each providers as provider (provider.id)}
        {@const configured = localConnections.some((connection) =>
          matchesKind(connection, provider.id),
        )}
        <Button
          type="button"
          variant="ghost"
          class="settings-row"
          onclick={() => (view = provider.id)}
        >
          <provider.icon size={20} />
          <span>
            <strong class="flex flex-wrap items-center gap-x-2 gap-y-1">
              {provider.name}
              {#if configured}<Badge variant="secondary"
                  >{l("Configured", "Configurato")}</Badge
                >{/if}
            </strong>
            <small
              >{provider.id === "kross"
                ? l(
                    "Find a reservation and prefill guest access.",
                    "Cerca una prenotazione e precompila l’accesso ospite.",
                  )
                : provider.id === "ical"
                  ? l(
                      "Turn calendar events into access code drafts.",
                      "Trasforma gli eventi del calendario in bozze di codici.",
                    )
                  : l(
                      "Read guest details from a screenshot.",
                      "Leggi i dettagli degli ospiti da uno screenshot.",
                    )}</small
            >
          </span>
          <ChevronRight size={18} />
        </Button>
      {/each}
    </Item.Group>
    <Alert.Root role="note"
      ><ShieldCheck /><Alert.Title
        >{l("You stay in control", "Decidi sempre tu")}</Alert.Title
      ><Alert.Description
        >{l(
          "No background imports or automatic access codes. Guests receive nothing until you review, save and share their link.",
          "Nessuna importazione in background o codice automatico. Gli ospiti non ricevono nulla finché non controlli, salvi e condividi il loro link.",
        )}</Alert.Description
      ></Alert.Root
    >
  {:else}
    {#if error}<Alert.Root variant="destructive"
        ><Alert.Title
          >{l(
            "Something needs your attention",
            "C’è qualcosa da controllare",
          )}</Alert.Title
        ><Alert.Description>{error}</Alert.Description></Alert.Root
      >{/if}
    <FeedbackToast message={notice} kind="info" />
    {#if currentConnections.length > 1}
      <div class="grid gap-2">
        <Label for="connector-connection"
          >{l("Connection", "Connessione")}</Label
        ><NativeSelect.Root
          id="connector-connection"
          class="w-full"
          bind:value={selectedId}
          disabled={pending}
          >{#each currentConnections as connection (connection.id)}<NativeSelect.Option
              value={connection.id}>{connection.name}</NativeSelect.Option
            >{/each}</NativeSelect.Root
        >
      </div>
    {/if}
    {#if view === "kross"}
      {#if connected}
        <Card.Root>
          <Card.Header class="gap-3"
            ><div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <Badge variant="secondary"
                  ><Check class="size-3" />{l("Connected", "Collegato")}</Badge
                ><span class="text-sm text-muted-foreground">{hotelId}</span>
              </div>
              {#if owner}<Button
                  variant="ghost"
                  disabled={pending}
                  onclick={() => perform(removeConnection)}
                  >{l("Disconnect", "Disconnetti")}</Button
                >{/if}
            </div>
          </Card.Header>
          <Card.Content class="grid min-w-0 gap-5">
            <div class="grid gap-2">
              <Label for="kross-property"
                >{l("KrossBooking property", "Struttura KrossBooking")}</Label
              ><NativeSelect.Root
                id="kross-property"
                class="w-full"
                bind:value={providerProperty}
                disabled={pending}
                onchange={() => {
                  records = [];
                  searched = false;
                  page = 0;
                }}
                ><NativeSelect.Option value=""
                  >{l(
                    "Select a property",
                    "Seleziona una struttura",
                  )}</NativeSelect.Option
                >{#each providerProperties as item (item.id_property)}<NativeSelect.Option
                    value={String(item.id_property)}
                    >{item.name ??
                      item.name_property ??
                      item.id_property}</NativeSelect.Option
                  >{/each}</NativeSelect.Root
              >
            </div>
            {#if !providerProperties.length}<Button
                variant="outline"
                disabled={pending}
                onclick={() =>
                  perform((current) => loadProperties(selectedId, current))}
                >{l("Load properties", "Carica strutture")}</Button
              >{/if}
          </Card.Content>
        </Card.Root>
        {#if providerProperty}
          <Card.Root class="min-w-0 py-0">
            {#key selectedId + "/" + providerProperty}
              <KrossPlanner
                timezone={property.timezone}
                loadRange={loadPlannerRange}
                onReview={(stay) =>
                  perform((current) => reviewReservation(stay, current))}
                {pending}
              />
            {/key}
          </Card.Root>
        {/if}
        <Card.Root>
          <Card.Header
            ><Card.Title>{l("Find a guest", "Trova un ospite")}</Card.Title
            ></Card.Header
          >
          <Card.Content class="grid gap-5">
            <form
              class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
              onsubmit={(event) => {
                event.preventDefault();
                void perform((current) =>
                  listReservations(current, 0, "arrivals"),
                );
              }}
            >
              <div class="grid gap-2">
                <Label for="kross-arrivals"
                  >{l("Arrivals date", "Data arrivi")}</Label
                ><DateInput
                  id="kross-arrivals"
                  label={l("Arrivals date", "Data arrivi")}
                  bind:value={arrivalDate}
                  required
                  disabled={pending}
                />
              </div>
              <Button type="submit" disabled={pending || !providerProperty}
                ><CalendarDays class="size-4" />{l(
                  "Find arrivals",
                  "Cerca arrivi",
                )}</Button
              >
            </form>
            <Separator />
            <form
              class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
              onsubmit={(event) => {
                event.preventDefault();
                void perform((current) =>
                  listReservations(current, 0, "search"),
                );
              }}
            >
              <div class="grid gap-2">
                <Label for="kross-search"
                  >{l("Search reservations", "Cerca prenotazioni")}</Label
                ><Input
                  id="kross-search"
                  placeholder={l(
                    "Guest name or reservation number",
                    "Nome ospite o numero prenotazione",
                  )}
                  bind:value={searchTerm}
                  disabled={pending}
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={pending || !providerProperty || !searchTerm.trim()}
                ><Search class="size-4" />{l("Search", "Cerca")}</Button
              >
            </form>
          </Card.Content>
        </Card.Root>
        {#if searched}
          <Card.Root
            ><Card.Header
              ><div class="flex items-center justify-between gap-3">
                <Card.Title>{l("Reservations", "Prenotazioni")}</Card.Title
                ><Badge variant="outline"
                  >{l("Page", "Pagina")} {page + 1}</Badge
                >
              </div></Card.Header
            ><Card.Content class="grid gap-2">
              {#each records as record, index (record.id_reservation ?? record.id ?? index)}
                <Button
                  variant="ghost"
                  class="h-auto min-h-16 w-full justify-between gap-4 whitespace-normal rounded-lg border p-4 text-left"
                  disabled={pending}
                  onclick={() =>
                    perform((current) => reviewReservation(record, current))}
                  ><span class="grid min-w-0 gap-1"
                    ><strong
                      >{record.label ??
                        record.name ??
                        l("Guest details", "Dettagli ospite")}</strong
                    ><span class="text-xs font-normal text-muted-foreground"
                      >{dates(record)}</span
                    ></span
                  ><span class="flex shrink-0 items-center gap-1 text-xs"
                    >{l("Review draft", "Controlla bozza")}<ChevronRight
                      class="size-4"
                    /></span
                  ></Button
                >
              {:else}<p class="py-6 text-center text-sm text-muted-foreground">
                  {l(
                    "No reservations found. Try another date or search.",
                    "Nessuna prenotazione trovata. Prova un’altra data o ricerca.",
                  )}
                </p>{/each}
            </Card.Content><Card.Footer class="flex justify-between gap-3"
              ><Button
                variant="outline"
                disabled={pending || page === 0}
                onclick={() =>
                  perform((current) => listReservations(current, page - 1))}
                ><ArrowLeft class="size-4" />{l(
                  "Previous",
                  "Precedente",
                )}</Button
              ><Button
                variant="outline"
                disabled={pending || !hasNext}
                onclick={() =>
                  perform((current) => listReservations(current, page + 1))}
                >{l("Next", "Successiva")}<ArrowRight class="size-4" /></Button
              ></Card.Footer
            ></Card.Root
          >
        {/if}
      {:else if owner}
        <Card.Root
          ><Card.Header
            ><Card.Title
              >{l("Connect KrossBooking", "Collega KrossBooking")}</Card.Title
            ><Card.Description
              >{l(
                "Use your KrossBooking credentials. Your password is used for sign-in only and is never saved.",
                "Usa le credenziali KrossBooking. La password viene usata solo per l’accesso e non viene mai salvata.",
              )}</Card.Description
            ></Card.Header
          ><Card.Content class="grid gap-5">
            <form
              class="grid gap-4"
              onsubmit={(event) => {
                event.preventDefault();
                void perform(login);
              }}
            >
              <div class="grid gap-2">
                <Label for="kross-hotel">{l("Hotel ID", "ID hotel")}</Label
                ><Input
                  id="kross-hotel"
                  bind:value={hotelId}
                  required
                  autocomplete="off"
                  disabled={pending || factors.length > 0}
                />
              </div>
              <div class="grid gap-2">
                <Label for="kross-username"
                  >{l("Username", "Nome utente")}</Label
                ><Input
                  id="kross-username"
                  bind:value={username}
                  required
                  autocomplete="username"
                  disabled={pending || factors.length > 0}
                />
              </div>
              <div class="grid gap-2">
                <Label for="kross-password">{l("Password", "Password")}</Label
                ><Input
                  id="kross-password"
                  type="password"
                  bind:value={password}
                  required
                  autocomplete="current-password"
                  disabled={pending || factors.length > 0}
                />
              </div>
              {#if !factors.length}<Button
                  type="submit"
                  disabled={pending ||
                    !hotelId.trim() ||
                    !username.trim() ||
                    !password}
                  >{#if pending}<LoaderCircle
                      class="size-4 animate-spin"
                    />{/if}{pending
                    ? l("Connecting…", "Connessione…")
                    : l("Connect KrossBooking", "Collega KrossBooking")}</Button
                >{/if}
            </form>
            {#if factors.length}
              <Separator />
              <div class="grid gap-4">
                <h3 class="text-sm font-semibold">
                  {l("Verify your identity", "Verifica la tua identità")}
                </h3>
                <div class="grid gap-2">
                  <Label for="kross-factor"
                    >{l("Verification method", "Metodo di verifica")}</Label
                  ><NativeSelect.Root
                    id="kross-factor"
                    class="w-full"
                    bind:value={factorIndex}
                    disabled={pending}
                    onchange={() => {
                      codeSent = false;
                      verification = "";
                    }}
                    ><NativeSelect.Option value=""
                      >{l(
                        "Choose a method",
                        "Scegli un metodo",
                      )}</NativeSelect.Option
                    >{#each factors as factor, index (index)}<NativeSelect.Option
                        value={String(index)}
                        >{factor["2fa_device"] ??
                          factor["2fa_type"]}</NativeSelect.Option
                      >{/each}</NativeSelect.Root
                  >
                </div>
                <Button
                  variant="outline"
                  disabled={pending || factorIndex === ""}
                  onclick={() => perform(sendVerification)}
                  >{codeSent
                    ? l("Send another code", "Invia un altro codice")
                    : l(
                        "Send verification code",
                        "Invia codice di verifica",
                      )}</Button
                >
                {#if codeSent}<form
                    class="grid gap-4"
                    onsubmit={(event) => {
                      event.preventDefault();
                      void perform(verify);
                    }}
                  >
                    <div class="grid gap-2">
                      <Label for="kross-otp"
                        >{l("Verification code", "Codice di verifica")}</Label
                      ><Input
                        id="kross-otp"
                        bind:value={verification}
                        autocomplete="one-time-code"
                        inputmode="numeric"
                        required
                        disabled={pending}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={pending || !verification.trim()}
                      >{l("Verify and connect", "Verifica e collega")}</Button
                    >
                  </form>{/if}<Button
                  variant="ghost"
                  disabled={pending}
                  onclick={cancel}>{t("Cancel")}</Button
                >
              </div>
            {:else if selected}<Button
                variant="ghost"
                disabled={pending}
                onclick={() => perform(removeConnection)}
                >{l(
                  "Remove saved connection",
                  "Rimuovi connessione salvata",
                )}</Button
              >{/if}
          </Card.Content></Card.Root
        >
      {:else}<Alert.Root role="note"
          ><Plug /><Alert.Title
            >{l(
              "Ask an owner to connect KrossBooking",
              "Chiedi a un proprietario di collegare KrossBooking",
            )}</Alert.Title
          ><Alert.Description
            >{l(
              "Once connected, everyone on the team can prepare drafts from reservations.",
              "Una volta collegato, tutto il team potrà preparare bozze dalle prenotazioni.",
            )}</Alert.Description
          ></Alert.Root
        >{/if}
    {:else if view === "ical"}
      <p class="text-sm leading-6 text-muted-foreground">
        {l(
          "A calendar provides names and dates. You choose which door those events should give access to, then review each code before saving.",
          "Un calendario fornisce nomi e date. Scegli tu a quale porta danno accesso gli eventi, poi controlli ogni codice prima di salvarlo.",
        )}
      </p>
      <Card.Root
        ><Card.Header
          ><div class="flex items-center gap-2">
            <Badge variant="secondary">1</Badge><Card.Title
              >{l("Choose a calendar", "Scegli un calendario")}</Card.Title
            >
          </div>
          <Card.Description
            >{l(
              "Upload an .ics file or fetch a saved calendar. Nothing is imported automatically.",
              "Carica un file .ics o recupera un calendario salvato. Nessuna importazione è automatica.",
            )}</Card.Description
          ></Card.Header
        ><Card.Content class="grid gap-5">
          <div class="grid gap-2">
            <Label for="calendar-file"
              >{l("Calendar file (.ics)", "File calendario (.ics)")}</Label
            ><Input
              id="calendar-file"
              type="file"
              accept=".ics,text/calendar"
              disabled={pending}
              onchange={(event) => {
                const input = event.currentTarget as HTMLInputElement;
                const file = input.files?.[0];
                input.value = "";
                if (file)
                  void perform((current) => readCalendar(file, current));
              }}
            />
            <p class="text-xs text-muted-foreground">
              {l(
                "Up to 4 MB. Events are read in your browser.",
                "Fino a 4 MB. Gli eventi vengono letti nel browser.",
              )}
            </p>
            {#if calendarFileName}<Badge variant="outline" class="w-fit"
                ><FileUp class="size-3" />{calendarFileName}</Badge
              >{/if}
          </div>
          <Separator />
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-sm font-semibold">
              {l("Connected calendars", "Calendari collegati")}
            </h3>
            {#if owner && selected && !addingCalendar}<Button
                variant="ghost"
                size="sm"
                onclick={() => (addingCalendar = true)}
                ><Plus class="size-4" />{l("Add", "Aggiungi")}</Button
              >{/if}
          </div>
          {#if selected && !addingCalendar}<div
              class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3"
            >
              <div class="flex items-center gap-2">
                <CalendarDays class="size-4 text-muted-foreground" /><strong
                  class="text-sm">{selected.name}</strong
                >
              </div>
              {#if owner}<Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onclick={() => perform(removeConnection)}
                  >{l("Disconnect", "Disconnetti")}</Button
                >{/if}
            </div>
            <Button
              variant="outline"
              disabled={pending}
              onclick={() => perform(fetchCalendar)}
              >{l("Fetch calendar now", "Carica calendario ora")}</Button
            >
          {:else if owner}<form
              class="grid gap-4"
              onsubmit={(event) => {
                event.preventDefault();
                void perform(saveCalendar);
              }}
            >
              <div class="grid gap-2">
                <Label for="calendar-name"
                  >{l("Calendar name", "Nome calendario")}</Label
                ><Input
                  id="calendar-name"
                  bind:value={calendarName}
                  placeholder={l(
                    "e.g. Room 1 calendar",
                    "es. Calendario Camera 1",
                  )}
                  required
                  disabled={pending}
                />
              </div>
              <div class="grid gap-2">
                <Label for="calendar-url"
                  >{l("Calendar URL", "URL calendario")}</Label
                ><Input
                  id="calendar-url"
                  type="url"
                  bind:value={calendarUrl}
                  placeholder="https://…"
                  required
                  disabled={pending}
                />
                <p class="text-xs leading-5 text-muted-foreground">
                  {l(
                    "The private URL is stored encrypted and is never displayed to staff.",
                    "L’URL privato viene salvato cifrato e non viene mai mostrato allo staff.",
                  )}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={pending || !calendarUrl.trim()}
                  >{l("Save calendar", "Salva calendario")}</Button
                >{#if selected}<Button
                    variant="ghost"
                    onclick={() => (addingCalendar = false)}
                    >{t("Cancel")}</Button
                  >{/if}
              </div>
            </form>
          {:else}<p class="text-sm text-muted-foreground">
              {l(
                "An owner can connect a calendar URL. You can upload a file above.",
                "Un proprietario può collegare un URL calendario. Puoi caricare un file qui sopra.",
              )}
            </p>{/if}
        </Card.Content></Card.Root
      >
      <Card.Root
        ><Card.Header
          ><div class="flex items-center gap-2">
            <Badge variant="secondary">2</Badge><Card.Title
              >{l(
                "Choose the access door",
                "Scegli la porta di accesso",
              )}</Card.Title
            >
          </div>
          <Card.Description
            >{l(
              "Calendar events do not know which guestin door to unlock. For example, map a Room 1 calendar to the Room 1 door.",
              "Gli eventi del calendario non sanno quale porta di guestin aprire. Ad esempio, associa il calendario Camera 1 alla porta Camera 1.",
            )}</Card.Description
          ></Card.Header
        ><Card.Content class="grid gap-3"
          ><div class="grid gap-2">
            <Label for="calendar-door"
              >{l(
                "Access door for these events",
                "Porta di accesso per questi eventi",
              )}</Label
            ><NativeSelect.Root
              id="calendar-door"
              class="w-full"
              bind:value={calendarDoor}
              disabled={pending || !localDoors.length}
              onchange={mapCalendarDoor}
              ><NativeSelect.Option value=""
                >{l("Choose a door", "Scegli una porta")}</NativeSelect.Option
              >{#each localDoors as door (door.id)}<NativeSelect.Option
                  value={door.id}>{door.name}</NativeSelect.Option
                >{/each}</NativeSelect.Root
            >
          </div>
          <p class="text-xs leading-5 text-muted-foreground">
            {l(
              "Every draft will preselect this door using the event's dates. You can add entrance doors, change dates or remove permissions in the draft.",
              "Ogni bozza preseleziona questa porta con le date dell’evento. Nella bozza puoi aggiungere gli ingressi, cambiare le date o rimuovere i permessi.",
            )}
          </p>
          {#if !localDoors.length}<Alert.Root role="note"
              ><DoorOpen /><Alert.Description
                >{l(
                  "Add a door in Doors first, then return here to choose it. You can already preview calendar events below.",
                  "Aggiungi prima una porta nella sezione Porte, poi torna qui per sceglierla. Puoi già vedere l’anteprima degli eventi qui sotto.",
                )}</Alert.Description
              ></Alert.Root
            >{/if}</Card.Content
        ></Card.Root
      >
      {#if calendarText}<Card.Root
          ><Card.Header
            ><div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <Badge variant="secondary">3</Badge><Card.Title
                  >{l("Review an event", "Controlla un evento")}</Card.Title
                >
              </div>
              <Badge variant="outline">{calendarResults.length}</Badge>
            </div>
            <Card.Description
              >{calendarDoor
                ? l(
                    "Open a draft to check the guest name, doors and access times. You still need to save the code yourself.",
                    "Apri una bozza per controllare nome, porte e orari. Devi ancora salvare personalmente il codice.",
                  )
                : l(
                    "Choose an access door above to turn an event into a draft. You can preview names and dates now.",
                    "Scegli una porta di accesso qui sopra per trasformare un evento in bozza. Puoi già vedere nomi e date.",
                  )}</Card.Description
            ></Card.Header
          ><Card.Content class="grid gap-2">
            {#each calendarResults as draft, index (index)}<Button
                variant="ghost"
                class="h-auto min-h-16 w-full justify-between gap-4 whitespace-normal rounded-lg border p-4 text-left"
                disabled={pending ||
                  !calendarDoor ||
                  !localDoors.some((door) => door.id === calendarDoor)}
                onclick={() => reviewCalendar(draft)}
                ><span class="grid min-w-0 gap-1"
                  ><strong
                    >{draft.label ||
                      l("Guest name missing", "Nome ospite mancante")}</strong
                  ><span class="text-xs font-normal text-muted-foreground"
                    >{calendarDates(draft)}</span
                  ></span
                ><span class="flex shrink-0 items-center gap-1 text-xs"
                  >{l("Review draft", "Controlla bozza")}<ChevronRight
                    class="size-4"
                  /></span
                ></Button
              >{:else}<p class="py-5 text-center text-sm text-muted-foreground">
                {l(
                  "No upcoming events were found in this calendar.",
                  "Nessun evento futuro trovato in questo calendario.",
                )}
              </p>{/each}
          </Card.Content></Card.Root
        >{/if}
    {:else if view === "ai"}
      {#if !selected && owner}
        <form
          class="stack"
          onsubmit={(event) => {
            event.preventDefault();
            if (!aiProvider || !aiKey.trim()) return;
            if (!aiModels.length) void perform(fetchAiModels);
            else if (aiModel) void perform(saveAi);
          }}
        >
          <p class="muted">
            {l(
              "Choose a provider and enter an API token to fetch its available models.",
              "Scegli un servizio e inserisci un token API per caricare i modelli disponibili.",
            )}
          </p>
          <div class="form-grid">
            <div class="grid gap-2">
              <Label for="ai-provider">{l("Provider", "Servizio")}</Label>
              <NativeSelect.Root
                id="ai-provider"
                class="w-full"
                bind:value={aiProvider}
                required
                disabled={pending}
                onchange={resetAiModels}
              >
                <NativeSelect.Option value="" disabled
                  >{l(
                    "Choose a provider",
                    "Scegli un servizio",
                  )}</NativeSelect.Option
                >
                {#each Object.entries(aiProviders) as [id, name] (id)}
                  <NativeSelect.Option value={id}>{name}</NativeSelect.Option>
                {/each}
              </NativeSelect.Root>
            </div>
            <div class="grid gap-2">
              <Label for="ai-token">{l("API token", "Token API")}</Label>
              <Input
                id="ai-token"
                type="password"
                bind:value={aiKey}
                autocomplete="off"
                required
                disabled={pending}
                oninput={resetAiModels}
              />
            </div>
          </div>
          {#if aiModels.length}
            <div class="grid gap-2">
              <Label for="ai-model">{l("Model", "Modello")}</Label>
              <NativeSelect.Root
                id="ai-model"
                class="w-full"
                bind:value={aiModel}
                required
                disabled={pending}
                aria-describedby="ai-model-help"
              >
                <NativeSelect.Option value="" disabled
                  >{l(
                    "Choose a model",
                    "Scegli un modello",
                  )}</NativeSelect.Option
                >
                {#each aiModels as model (model.id)}
                  <NativeSelect.Option value={model.id}
                    >{model.name === model.id
                      ? model.id
                      : model.name + " · " + model.id}</NativeSelect.Option
                  >
                {/each}
              </NativeSelect.Root>
              <p id="ai-model-help" class="muted">
                {l(
                  "Choose a model that supports image input.",
                  "Scegli un modello che supporta le immagini.",
                )}
              </p>
            </div>
          {/if}
          <div class="row">
            {#if aiModels.length}
              <Button type="submit" disabled={pending || !aiModel}
                >{l("Connect AI", "Collega AI")}</Button
              >
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onclick={() => void perform(fetchAiModels)}
              >
                {l("Refresh models", "Aggiorna modelli")}
              </Button>
            {:else}
              <Button
                type="submit"
                disabled={pending || !aiProvider || !aiKey.trim()}
              >
                {pending
                  ? l("Loading models…", "Caricamento modelli…")
                  : l("Fetch models", "Carica modelli")}
              </Button>
            {/if}
          </div>
        </form>
      {:else if !selected}<Alert.Root role="note"
          ><Plug /><Alert.Description
            >{l(
              "An owner needs to connect AI for the team first.",
              "Un proprietario deve prima collegare AI per il team.",
            )}</Alert.Description
          ></Alert.Root
        >
      {:else}<Card.Root
          ><Card.Header
            ><div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <Badge variant="secondary"
                  ><Check class="size-3" />{l("Connected", "Collegato")}</Badge
                ><span class="text-sm text-muted-foreground"
                  >{aiProviders[
                    selected.kind === "gemini"
                      ? "google"
                      : (selected.data.provider as AiProvider)
                  ]} · {selected.data.model ?? "gemini-2.5-flash"}</span
                >
              </div>
              {#if owner}<Button
                  variant="ghost"
                  disabled={pending}
                  onclick={() => perform(removeConnection)}
                  >{l("Disconnect", "Disconnetti")}</Button
                >{/if}
            </div>
            <Card.Title
              >{l("Read a screenshot", "Leggi uno screenshot")}</Card.Title
            ><Card.Description
              >{l(
                "The image is sent to the selected AI provider and is not saved by guestin. Review every extracted field before saving a code.",
                "L’immagine viene inviata al servizio AI scelto e non viene salvata da guestin. Controlla ogni campo estratto prima di salvare un codice.",
              )}</Card.Description
            ></Card.Header
          ><Card.Content class="grid gap-4"
            ><div class="grid gap-2">
              <Label for="ai-screenshot">{l("Screenshot", "Screenshot")}</Label
              ><Input
                id="ai-screenshot"
                bind:ref={screenshotInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={pending}
                onchange={(event) => {
                  const input = event.currentTarget as HTMLInputElement;
                  const file = input.files?.[0];
                  input.value = "";
                  if (file) chooseImage(file);
                }}
              />
            </div>
            {#if imageUrl}<img
                class="max-h-64 w-full rounded-lg border object-contain"
                src={imageUrl}
                alt={l("Selected screenshot", "Screenshot selezionato")}
              />
              <div class="flex flex-wrap gap-2">
                <Button disabled={pending} onclick={() => perform(extract)}
                  >{#if pending}<LoaderCircle
                      class="size-4 animate-spin"
                    />{/if}{pending
                    ? l("Extracting…", "Estrazione…")
                    : l("Extract details", "Estrai dettagli")}</Button
                ><Button
                  variant="outline"
                  onclick={() => {
                    cancel();
                    clearImage();
                  }}><X class="size-4" />{t("Cancel")}</Button
                >
              </div>{/if}</Card.Content
          ></Card.Root
        >
        {#if extraction}<Card.Root
            ><Card.Header
              ><Card.Title
                >{l(
                  "Review extracted details",
                  "Controlla i dettagli estratti",
                )}</Card.Title
              ><Card.Description
                >{l(
                  "Missing or uncertain fields need manual completion. Nothing has been saved yet.",
                  "Completa manualmente i campi mancanti o incerti. Non è stato ancora salvato nulla.",
                )}</Card.Description
              ></Card.Header
            ><Card.Content class="grid gap-3"
              ><strong
                >{extraction.label ||
                  l("Guest name missing", "Nome ospite mancante")}</strong
              >
              <p class="text-sm text-muted-foreground">
                {extraction.grants?.length ?? 0}
                {l("matched doors", "porte corrispondenti")}
              </p>
              {#if extraction.breakfast}<p
                  class="text-sm text-muted-foreground"
                >
                  {l("Proposed breakfasts", "Colazioni proposte")}: {extraction
                    .breakfast.total} · {formatDisplayDate(
                    extraction.breakfast.start,
                  )} → {formatDisplayDate(extraction.breakfast.end)}
                </p>{:else if extractionBreakfast !== undefined}<p
                  class="text-sm text-muted-foreground"
                >
                  {l("Breakfast quantity found", "Colazioni rilevate")}: {extractionBreakfast}.
                  {l(
                    "Choose breakfast dates in the draft.",
                    "Scegli le date della colazione nella bozza.",
                  )}
                </p>{/if}</Card.Content
            ><Card.Footer
              ><Button onclick={() => review(extraction!, extractionDetails)}
                >{l("Review draft", "Controlla bozza")}<ArrowRight
                  class="size-4"
                /></Button
              ></Card.Footer
            ></Card.Root
          >{/if}
      {/if}
    {/if}
    {#if pending}<p
        class="flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle class="size-4 animate-spin" />{l(
          "Working…",
          "Operazione in corso…",
        )}
      </p>{/if}
  {/if}
</section>

<Modal
  open={settingsOpen && view === "kross"}
  title={l("Contact settings", "Impostazioni contatto")}
  onclose={() => (settingsOpen = false)}
>
  <form
    class="grid gap-3"
    onsubmit={(event) => {
      event.preventDefault();
      if (formatValid)
        void perform(async () => {
          await savePreferences({ contactNameFormat: formatDraft.trim() });
          settingsOpen = false;
        });
    }}
  >
    <Label for="contact-format"
      >{l("Contact name format", "Formato nome contatto")}</Label
    >
    <Input
      id="contact-format"
      bind:ref={formatInput}
      bind:value={formatDraft}
      maxlength={180}
    />
    <div class="flex flex-wrap gap-1">
      {#each Object.keys(sampleContact) as key (key)}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onclick={() => insertPlaceholder(key)}>{"{" + key + "}"}</Button
        >
      {/each}
    </div>
    <p class="text-sm text-muted-foreground">
      {l("Preview", "Anteprima")} · {contactName(formatDraft, sampleContact)}
    </p>
    {#if !formatValid}<p role="alert">
        {l(
          "Enter a name format using the listed placeholders.",
          "Inserisci un formato usando i segnaposto elencati.",
        )}
      </p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
    <Button type="submit" disabled={!formatValid || pending}
      >{l("Save", "Salva")}</Button
    >
  </form>
</Modal>

<Modal
  open={!!preview}
  title={l("Review imported details", "Controlla i dettagli importati")}
  onclose={() => (preview = null)}
>
  {#if preview}{@const imported = preview}
    <div class="space-y-6" data-connector-preview>
      <div>
        <Badge variant="secondary">{preview.source}</Badge>
        <h2 class="mt-3 text-xl font-semibold">
          {preview.draft.label ||
            l("Guest name missing", "Nome ospite mancante")}
        </h2>
        <p class="mt-2 text-sm text-muted-foreground">
          {l(
            "Check the source details and proposed access before opening the editable code form. No access code has been created.",
            "Controlla i dati originali e gli accessi proposti prima di aprire il modulo modificabile. Nessun codice è stato creato.",
          )}
        </p>
      </div>
      {#snippet reservationInfo()}
        {#if imported.contact}
          {@const contact = imported.contact}
          <Button
            variant="outline"
            onclick={() => saveGuestContact(contact, contactNameFormat)}
            ><Contact />{l("Save contact", "Salva contatto")}</Button
          >
        {:else if view === "kross"}
          <p class="mb-3 font-medium text-amber-700 dark:text-amber-400">
            {l(
              "No phone number provided",
              "Numero di telefono non disponibile",
            )}
          </p>
        {/if}
        <dl class="grid gap-3">
          {#each imported.details.filter(([, value]) => value) as [label, value], index (index)}<div
              class="border-b pb-3"
            >
              <dt class="text-xs text-muted-foreground">{label}</dt>
              <dd class="mt-1 whitespace-pre-wrap break-words text-sm">
                {value}
              </dd>
            </div>{/each}
        </dl>
      {/snippet}
      {#snippet proposedCode()}
        <section class="space-y-3">
          <h3 class="font-medium">
            {l("Proposed door permissions", "Permessi porta proposti")}
          </h3>
          <p class="text-xs text-muted-foreground">{property.timezone}</p>
          {#each imported.draft.grants as grant (grant.doorId)}<div
              class="border-b pb-3 text-sm"
            >
              <strong
                >{localDoors.find((d) => d.id === grant.doorId)?.name}</strong
              >
              <p class="mt-1 text-muted-foreground">
                {formatDisplayDateTime(grant.start, property.timezone)} → {formatDisplayDateTime(
                  grant.end,
                  property.timezone,
                )}
              </p>
              <small
                >{grant.singleUse
                  ? l("Single use", "Monouso")
                  : l("Multiple uses", "Utilizzi multipli")}</small
              >
            </div>{:else}<p class="text-sm text-amber-700 dark:text-amber-400">
              {l(
                "No doors could be mapped with valid dates. Select doors and fill in dates in the form.",
                "Nessuna porta associata con date valide. Seleziona porte e date nel modulo.",
              )}
            </p>{/each}
        </section>
        {#if imported.draft.breakfast}<section class="text-sm">
            <h3 class="font-medium">{l("Breakfast", "Colazioni")}</h3>
            <p>
              {imported.draft.breakfast.total} · {formatDisplayDate(
                imported.draft.breakfast.start,
              )} → {formatDisplayDate(imported.draft.breakfast.end)}
            </p>
          </section>{/if}
        <dl class="space-y-3 text-sm">
          <div>
            <dt class="text-muted-foreground">
              {l("Check-in link", "Link check-in")}
            </dt>
            <dd class="break-all">
              {imported.draft.checkinLink ||
                l("Not supplied", "Non disponibile")}
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground">
              {l("Instructions link", "Link istruzioni")}
            </dt>
            <dd class="break-all">
              {imported.draft.instructionsLink ||
                l("Not supplied", "Non disponibile")}
            </dd>
          </div>
        </dl>
      {/snippet}
      {#if view === "kross"}
        <Accordion.Root type="multiple" value={["reservation"]}>
          <Accordion.Item value="reservation">
            <Accordion.Trigger
              >{l("Reservation", "Prenotazione")}</Accordion.Trigger
            >
            <Accordion.Content>{@render reservationInfo()}</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="code">
            <Accordion.Trigger
              >{l("Proposed code", "Codice proposto")}</Accordion.Trigger
            >
            <Accordion.Content
              ><div class="space-y-4">
                {@render proposedCode()}
              </div></Accordion.Content
            >
          </Accordion.Item>
        </Accordion.Root>
      {:else}
        {@render reservationInfo()}
        {@render proposedCode()}
      {/if}
      <div class="flex flex-wrap gap-2">
        <Button
          onclick={() => {
            const value = imported.draft;
            preview = null;
            onDraft(value);
          }}
          >{l(
            "Use details in access code",
            "Usa i dettagli nel codice",
          )}</Button
        ><Button variant="outline" onclick={() => (preview = null)}
          >{t("Cancel")}</Button
        >
      </div>
    </div>{/if}
</Modal>
