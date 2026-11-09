<script lang="ts">
  import { onMount } from "svelte";
  import {
    KeyRound,
    DoorOpen,
    Plus,
    Activity,
    Settings,
    CircleHelp,
    ChevronRight,
    MessageSquare,
    Plug,
    ChartNoAxesColumn,
    ArrowLeft,
    UserRound,
    Palette,
    Languages,
    UsersRound,
    Building2,
    Bell,
    Coffee,
    Database,
    Copy,
    Link,
    Share2,
    ExternalLink,
    Search,
    Check,
    Monitor,
    Sun,
    Moon,
    X,
    CalendarDays,
    ChevronLeft,
    Ellipsis,
    LogOut,
    ListFilter,
    Pencil,
  } from "@lucide/svelte";
  import ConnectorManager from "$lib/components/ConnectorManager.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import { copyText, guestToken } from "$lib/browser";
  import DoorManager from "$lib/components/DoorManager.svelte";
  import Tour from "$lib/components/Tour.svelte";
  import LanguageChoice from "$lib/components/LanguageChoice.svelte";
  import {
    hostLanguage,
    t,
    restoreHostLocale,
    setHostLocale,
    type HostLocale,
  } from "$lib/i18n.svelte";
  let languagePrompt = $state(false),
    suggestedLocale = $state<HostLocale>("en");
  $effect(() => {
    if (typeof document !== "undefined")
      document.documentElement.lang = hostLanguage.current;
  });
  import {
    codeSchema,
    defaultTemplates,
    type AccessCodeDraft,
  } from "../../../../shared/schema";
  import { wallTime } from "../../../../shared/connectors";
  import Button from "$lib/components/ui/button/button.svelte";
  let user = $state<any>(null),
    csrf = "",
    ready = $state(false),
    needsSetup = $state(false),
    error = $state(""),
    notice = $state(""),
    busy = $state(false),
    tab = $state("Codes");
  let name = $state(""),
    email = $state(""),
    password = $state(""),
    setupToken = $state(""),
    invite = $state("");
  let properties = $state<any[]>([]),
    doors = $state<any[]>([]),
    codes = $state<any[]>([]),
    events = $state<any[]>([]),
    connections = $state<any[]>([]),
    reports = $state<any[]>([]),
    users = $state<any[]>([]),
    propertyId = $state(""),
    search = $state("");
  let codeDate = $state(""),
    codeStatus = $state("all"),
    detailCodeId = $state(""),
    detailDoorId = $state(""),
    quickCreate = $state(false),
    theme = $state("system"),
    currentTime = $state(Date.now()),
    systemDark = $state(false),
    routeReady = $state(false),
    wipeOpen = $state(false),
    wipePassword = $state(""),
    wipeConfirmation = $state(""),
    wipeAcknowledged = $state(false),
    shareCodeId = $state(""),
    shareLanguage = $state("en"),
    shareKind = $state("access"),
    shareText = $state("");
  let settingsPage = $state(""),
    propertyForm = $state(false),
    connectorView = $state<"list" | "kross" | "ical" | "gemini">("list"),
    invitationLink = $state(""),
    manualCopy = $state(""),
    copyDialog = $state(false),
    filtersOpen = $state(false);
  let copyInput = $state<HTMLTextAreaElement>();
  const settingItems = [
    {
      id: "appearance",
      title: "Appearance",
      description: "Light, dark or follow your device",
      icon: Palette,
      group: "Preferences",
    },
    {
      id: "language",
      title: "App language",
      description: "Italiano or English",
      icon: Languages,
      group: "Preferences",
    },
    {
      id: "notifications",
      title: "Notifications",
      description: "Choose the updates you receive",
      icon: Bell,
      group: "Preferences",
    },
    {
      id: "properties",
      title: "Properties",
      description: "Names, timezones and arrival defaults",
      icon: Building2,
      group: "Workspace",
    },
    {
      id: "connectors",
      title: "Connectors",
      description: "KrossBooking, calendars and image import",
      icon: Plug,
      group: "Workspace",
    },
    {
      id: "messages",
      title: "Message templates",
      description: "Personalize what you share with guests",
      icon: MessageSquare,
      group: "Workspace",
    },
    {
      id: "team",
      title: "Team",
      description: "Invite and manage your staff",
      icon: UsersRound,
      group: "Workspace",
      owner: true,
    },
    {
      id: "reports",
      title: "Reports",
      description: "Code creation and usage by host",
      icon: ChartNoAxesColumn,
      group: "Workspace",
    },
    {
      id: "breakfast",
      title: "Breakfast totals",
      description: "Open the public count page",
      icon: Coffee,
      group: "Workspace",
    },
    {
      id: "data",
      title: "Data management",
      description: "Backups and workspace reset",
      icon: Database,
      group: "Administration",
      owner: true,
    },
  ];
  const currentSetting = $derived(
    settingItems.find((i) => i.id === settingsPage),
  );
  function openSettings(id: string) {
    if (id === "connectors" || id === "messages" || id === "reports") {
      navigate(id[0].toUpperCase() + id.slice(1));
      return;
    }
    navigate("Settings");
    settingsPage = id;
  }
  function back() {
    if (tab === "Settings" && propertyForm) {
      propertyForm = false;
      pEditing = "";
      return;
    }
    if (tab === "Connectors" && connectorView !== "list") {
      connectorView = "list";
      return;
    }
    if (tab === "Settings") {
      settingsPage = "";
      return;
    }
    navigate(
      tab === "Codes" ? "Codes" : tab === "Doors" ? "Doors" : "Settings",
    );
  }
  function editProperty(p?: any) {
    pEditing = p?.id ?? "";
    pName = p?.name ?? "";
    pZone = p?.timezone ?? "Europe/Rome";
    pIn = p?.checkIn ?? "15:00";
    pOut = p?.checkOut ?? "11:00";
    propertyForm = true;
  }
  function shiftDay(delta: number) {
    const current = codeDate || dayAt(new Date().toISOString(), propertyId);
    codeDate = new Date(Date.parse(current + "T12:00:00Z") + delta * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  async function logout() {
    await api("logout", {});
    localStorage.removeItem("oshost.draft." + user.id);
    localStorage.removeItem("oshost.draft.lastUser");
    resetAccountUI();
    user = null;
    csrf = "";
    history.replaceState(null, "", "/host/");
  }
  async function revoke(c: any) {
    if (!confirm(t("Revoke this guest link immediately?"))) return;
    await api(`codes/${c.id}/revoke`, {});
    await reload();
    notice = "Access revoked.";
  }
  async function replaceLink(c: any) {
    if (!confirm(t("Invalidate the previous link and generate a replacement?")))
      return;
    await api(`codes/${c.id}/regenerate`, {});
    await reload();
    notice = "Guest link replaced.";
  }
  function codeRange(c: any) {
    if (!c.grants.length) return t("No doors");
    return (
      formatInstant(
        c.grants.reduce(
          (v: string, g: any) => (g.start < v ? g.start : v),
          c.grants[0].start,
        ),
        c.propertyId,
      ) +
      " → " +
      formatInstant(
        c.grants.reduce(
          (v: string, g: any) => (g.end > v ? g.end : v),
          c.grants[0].end,
        ),
        c.propertyId,
      )
    );
  }
  let templateInput = $state<HTMLTextAreaElement>();
  const detailCode = $derived(codes.find((c) => c.id === detailCodeId));
  const duplicateCodes = $derived(
    codes.filter(
      (c) =>
        c.id !== editId &&
        !c.revoked &&
        codeFingerprint(c) === codeFingerprint(draft),
    ),
  );
  function codeFingerprint(c: any) {
    return JSON.stringify({
      propertyId: c.propertyId,
      label: c.label?.trim(),
      notes: c.notes ?? "",
      checkinLink: c.checkinLink ?? "",
      instructionsLink: c.instructionsLink ?? "",
      breakfast: c.breakfast ?? null,
      grants: (c.grants ?? [])
        .map((g: any) => ({
          doorId: g.doorId,
          start: g.start,
          end: g.end,
          singleUse: !!g.singleUse,
          active: g.active !== false,
        }))
        .sort((a: any, b: any) => a.doorId.localeCompare(b.doorId)),
    });
  }
  function grantStatus(g: any) {
    const d = doors.find((d) => d.id === g.doorId);
    if (g.active === false) return "Paused";
    if (d?.enabled === false) return "Door disabled";
    if (g.claim) return "Uncertain";
    if (g.singleUse && g.used) return "Used";
    if (Date.parse(g.start) > currentTime) return "Upcoming";
    if (Date.parse(g.end) <= currentTime) return "Expired";
    if (d?.integration === "none") return "Not connected yet";
    return "Valid now";
  }
  function statusOf(c: any) {
    if (c.revoked) return "Revoked";
    if (c.grants.some((g: any) => grantStatus(g) === "Valid now"))
      return "Valid now";
    if (c.grants.some((g: any) => grantStatus(g) === "Upcoming"))
      return "Upcoming";
    if (
      c.grants.length &&
      c.grants.every((g: any) => grantStatus(g) === "Expired")
    )
      return "Expired";
    return "No available doors";
  }
  function dayAt(iso: string, id: string) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: properties.find((p) => p.id === id)?.timezone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  }
  function formatInstant(iso: string, id: string) {
    return new Intl.DateTimeFormat(hostLanguage.current, {
      timeZone: properties.find((p) => p.id === id)?.timezone ?? "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  }
  function applyPreferences() {
    if (user.preferences?.language)
      setHostLocale(user.id, user.preferences.language);
    else restoreHostLocale(user.id);
    theme = user.preferences?.theme ?? "system";
  }
  async function preferences(value: any) {
    const accountId = user?.id;
    const result = await api("me/preferences", value, "PATCH");
    if (user?.id !== accountId) return;
    user = { ...user, preferences: result.preferences ?? result };
    applyPreferences();
  }
  async function chooseLanguage(locale: HostLocale) {
    await preferences({ language: locale });
  }
  function readRoute() {
    const [destination, id, action] = location.hash
      .replace(/^#\//, "")
      .split("/");
    const found = [
      ...navigation.map((n) => n.name),
      ...tools.map((n) => n.name),
      "Profile",
    ].find((n) => n.toLowerCase() === destination);
    if (!found) return;
    const savedDraft = user && localStorage.getItem("oshost.draft." + user.id);
    const savedEditId =
      user && localStorage.getItem("oshost.draft.editId." + user.id);
    const canRestore =
      savedDraft &&
      (id === "new" ? !savedEditId : action === "edit" && savedEditId === id);
    tab = found;
    settingsPage = found === "Settings" ? (id ?? "") : "";
    propertyForm = found === "Settings" && id === "properties" && !!action;
    if (propertyForm) editProperty(properties.find((p) => p.id === action));
    connectorView =
      found === "Connectors" && ["kross", "ical", "gemini"].includes(id)
        ? (id as "kross" | "ical" | "gemini")
        : "list";
    editing = false;
    doorEditor = false;
    detailCodeId = "";
    detailDoorId = "";
    quickCreate = false;
    if (found === "Codes" && id === "new") {
      if (canRestore) {
        draft = JSON.parse(savedDraft!);
        editId = "";
        editing = true;
        propertyId = draft.propertyId;
      } else newCode();
    } else if (found === "Codes" && id) {
      const c = codes.find((c) => c.id === id);
      if (c) {
        propertyId = c.propertyId;
        if (action === "edit") {
          if (canRestore) {
            draft = JSON.parse(savedDraft!);
            editId = id;
            editing = true;
          } else edit(c);
        } else detailCodeId = id;
      }
    }
    if (found === "Doors" && id) {
      const d = doors.find((d) => d.id === id);
      if (d) propertyId = d.propertyId;
      if (id === "new" || action === "edit") {
        editingDoor = id === "new" ? "" : id;
        doorEditor = true;
      } else detailDoorId = id;
    }
  }
  $effect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme =
        theme === "system" ? (systemDark ? "dark" : "light") : theme;
      document.documentElement.style.colorScheme =
        document.documentElement.dataset.theme;
    }
  });
  $effect(() => {
    if (!routeReady || !user) return;
    let route = "/" + tab.toLowerCase();
    if (tab === "Settings" && settingsPage)
      route +=
        "/" + settingsPage + (propertyForm ? "/" + (pEditing || "new") : "");
    if (tab === "Connectors" && connectorView !== "list")
      route += "/" + connectorView;
    if (tab === "Codes")
      route += editing
        ? editId
          ? "/" + editId + "/edit"
          : "/new"
        : detailCodeId
          ? "/" + detailCodeId
          : "";
    if (tab === "Doors")
      route += doorEditor
        ? editingDoor
          ? "/" + editingDoor + "/edit"
          : "/new"
        : detailDoorId
          ? "/" + detailDoorId
          : "";
    if (location.hash !== "#" + route) history.pushState(null, "", "#" + route);
  });
  function preview(template: string, c?: any, language = templateLang) {
    const values: Record<string, string> = {
      guest: c?.label ?? "Maria Rossi",
      link: c?.link
        ? c.link + "&lang=" + language
        : location.origin + "/guest/#code=example",
      checkinLink: c?.checkinLink ?? "https://example.com/check-in",
      instructionsLink: c?.instructionsLink ?? "https://example.com/arrival",
      host: user.name,
    };
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
  }
  async function prepareShare(c: any) {
    notice = "";
    shareText = "";
    shareCodeId = c.id;
    shareLanguage = hostLanguage.current;
    shareKind = "access";
    try {
      const source = await api("templates/" + c.propertyId);
      if (shareCodeId !== c.id) return;
      templates = source;
      refreshShare();
    } catch (e) {
      if (shareCodeId === c.id) shareCodeId = "";
      throw e;
    }
  }
  function refreshShare() {
    shareText = preview(
      templates[shareLanguage]?.[shareKind] ?? "",
      codes.find((c) => c.id === shareCodeId),
      shareLanguage,
    );
  }
  function insertPlaceholder(key: string) {
    const value = templates[templateLang][templateKind],
      start = templateInput?.selectionStart ?? value.length,
      end = templateInput?.selectionEnd ?? start;
    templates[templateLang][templateKind] =
      value.slice(0, start) + "{{" + key + "}}" + value.slice(end);
    templateInput?.focus();
  }
  async function wipeDatabase() {
    await api("admin/wipe", {
      password: wipePassword,
      confirmation: wipeConfirmation,
    });
    for (const key of Object.keys(localStorage))
      if (key.startsWith("oshost.")) localStorage.removeItem(key);
    sessionStorage.clear();
    location.replace("/host/");
  }
  let editing = $state(false),
    editId = $state(""),
    draft = $state<AccessCodeDraft>({
      propertyId: "",
      label: "",
      notes: "",
      checkinLink: "",
      instructionsLink: "",
      grants: [],
      breakfast: null,
    });
  let pEditing = $state(""),
    pName = $state(""),
    pZone = $state("Europe/Rome"),
    pIn = $state("15:00"),
    pOut = $state("11:00");
  let editingDoor = $state("");
  let date = $state(new Date().toISOString().slice(0, 10));
  let templates = $state<any>(structuredClone(defaultTemplates)),
    templatesLoading = $state(false),
    templateLang = $state("en"),
    templateKind = $state("access"),
    messageCode = $state(""),
    message = $state("");
  let pushProperties = $state<string[]>([]),
    pushEvents = $state(""),
    permission = $state("");
  $effect(() => {
    if (tab !== "Messages" || !propertyId) return;
    let cancelled = false;
    templatesLoading = true;
    void api("templates/" + propertyId)
      .then((value) => {
        if (!cancelled) {
          templates = value;
          templatesLoading = false;
        }
      })
      .catch((e) => {
        if (!cancelled) {
          error = (e as Error).message;
          templatesLoading = false;
        }
      });
    return () => {
      cancelled = true;
    };
  });
  const property = $derived(properties.find((p) => p.id === propertyId));
  const filtered = $derived(
    codes.filter(
      (c) =>
        (!propertyId || c.propertyId === propertyId) &&
        c.label.toLowerCase().includes(search.toLowerCase()) &&
        (codeStatus === "all" || statusOf(c) === codeStatus) &&
        (!codeDate ||
          c.grants.some(
            (g: any) =>
              dayAt(g.start, c.propertyId) <= codeDate &&
              dayAt(
                new Date(Date.parse(g.end) - 1).toISOString(),
                c.propertyId,
              ) >= codeDate,
          ) ||
          (c.breakfast &&
            c.breakfast.start <= codeDate &&
            c.breakfast.end >= codeDate)),
    ),
  );
  const stats = $derived.by(() => {
    const rows: Record<
      string,
      {
        name: string;
        month: string;
        created: number;
        used: number;
        attempts: number;
        accepted: number;
      }
    > = {};
    for (const r of reports.filter(
      (r) => !propertyId || r.property_id === propertyId,
    )) {
      const zone = property?.timezone ?? "UTC";
      const month = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
      }).format(new Date(r.created));
      const key = r.creator + month;
      const row = (rows[key] ??= {
        name: r.name ?? "Former staff",
        month,
        created: 0,
        used: 0,
        attempts: 0,
        accepted: 0,
      });
      row.created++;
      row.used += Number(r.accepted > 0);
      row.attempts += r.attempts;
      row.accepted += r.accepted;
    }
    return Object.values(rows);
  });
  async function api(
    path: string,
    body?: any,
    method = body === undefined ? "GET" : "POST",
    headers: Record<string, string> = {},
  ) {
    const r = await fetch("/api/v1/" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await r.json();
    if (!r.ok)
      throw Object.assign(Error(data.error ?? "Request failed"), {
        status: r.status,
        code: data.code,
      });
    return data;
  }
  async function act(fn: () => Promise<void>) {
    busy = true;
    error = "";
    notice = "";
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function reload() {
    [properties, doors, codes, events, connections, reports] =
      await Promise.all(
        [
          "properties",
          "doors",
          "codes",
          "events",
          "connections",
          "reports",
        ].map((p) => api(p)),
      );
    if (!propertyId) propertyId = properties[0]?.id ?? "";
    if (user?.role === "owner") users = await api("users");
  }
  onMount(() => {
    const clockTimer = setInterval(() => (currentTime = Date.now()), 15000);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => (systemDark = media.matches);
    updateTheme();
    media.addEventListener("change", updateTheme);
    window.addEventListener("popstate", readRoute);
    window.addEventListener("hashchange", readRoute);
    void act(async () => {
      invite = new URLSearchParams(location.hash.slice(1)).get("invite") ?? "";
      try {
        const me = await api("me");
        user = me.user;
        applyPreferences();
        csrf = me.csrf;
        await reload();
        const saved = localStorage.getItem("oshost.draft." + user.id);
        if (saved) {
          draft = JSON.parse(saved);
          editId = localStorage.getItem("oshost.draft.editId." + user.id) ?? "";
          editing = true;
          notice = "Your unfinished draft has been restored.";
        }
      } catch {
        const lastUser = localStorage.getItem("oshost.draft.lastUser");
        const saved =
          lastUser && localStorage.getItem("oshost.draft." + lastUser);
        if (!navigator.onLine && saved) {
          draft = JSON.parse(saved);
          user = { id: lastUser, name: "Offline draft", role: "staff" };
          applyPreferences();
          editing = true;
          properties = [
            {
              id: draft.propertyId,
              name: "Draft property",
              timezone: localStorage.getItem("oshost.draft.timezone") ?? "UTC",
            },
          ];
          propertyId = draft.propertyId;
          notice =
            "Offline draft restored. Reconnect and refresh before publishing.";
        } else {
          needsSetup = (await api("auth/status")).needsSetup;
        }
      }
      ready = true;
      readRoute();
      routeReady = true;
      if (
        user &&
        !editing &&
        navigator.onLine &&
        (user.preferences?.tour ?? "pending") === "pending"
      )
        startTour();
      permission =
        typeof Notification !== "undefined"
          ? Notification.permission
          : "unsupported";
    });
    return () => {
      clearInterval(clockTimer);
      media.removeEventListener("change", updateTheme);
      window.removeEventListener("popstate", readRoute);
      window.removeEventListener("hashchange", readRoute);
    };
  });
  $effect(() => {
    if (user && editing) {
      localStorage.setItem("oshost.draft." + user.id, JSON.stringify(draft));
      localStorage.setItem("oshost.draft.editId." + user.id, editId);
      localStorage.setItem("oshost.draft.lastUser", user.id);
      localStorage.setItem(
        "oshost.draft.timezone",
        properties.find((p) => p.id === draft.propertyId)?.timezone ?? "UTC",
      );
    }
  });
  function resetAccountUI() {
    routeReady = false;
    settingsPage = "";
    propertyForm = false;
    connectorView = "list";
    invitationLink = "";
    copyDialog = false;
    manualCopy = "";
    invite = "";
    tourVisible = false;
    languagePrompt = false;
    editing = false;
    editId = "";
    detailCodeId = "";
    doorEditor = false;
    editingDoor = "";
    detailDoorId = "";
    shareCodeId = "";
    shareText = "";
    quickCreate = false;
    wipeOpen = false;
    wipePassword = "";
    wipeConfirmation = "";
    wipeAcknowledged = false;
    propertyId = "";
    properties = [];
    doors = [];
    codes = [];
    events = [];
    connections = [];
    reports = [];
    users = [];
    pEditing = "";
    pName = "";
    messageCode = "";
    message = "";
    tab = "Codes";
    search = "";
    codeDate = "";
    codeStatus = "all";
    error = "";
    notice = "";
    theme = "system";
    draft = {
      propertyId: "",
      label: "",
      notes: "",
      checkinLink: "",
      instructionsLink: "",
      grants: [],
      breakfast: null,
    };
  }
  async function login() {
    const route = needsSetup
      ? "auth/setup"
      : invite
        ? "auth/accept-invite"
        : "auth/login";
    const r = await api(route, { name, email, password, setupToken, invite });
    resetAccountUI();
    user = r.user;
    applyPreferences();
    csrf = r.csrf;
    password = "";
    setupToken = "";
    history.replaceState(null, "", "/host/");
    await reload();
    routeReady = true;
    if ((user.preferences?.tour ?? "pending") === "pending") startTour();
  }
  function newCode(value?: any) {
    quickCreate = false;
    detailCodeId = "";
    if (!value && tourVisible && resumeTourDraft) {
      editing = true;
      tab = "Codes";
      resumeTourDraft = false;
      return;
    }

    editId = "";
    const p = properties.find(
      (p) => p.id === (value?.propertyId ?? propertyId),
    );
    const start = new Date(),
      end = new Date();
    end.setTime(
      Date.parse(
        wallTime(
          new Intl.DateTimeFormat("en-CA", {
            timeZone: p?.timezone ?? "UTC",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(start),
          "23:59",
          p?.timezone ?? "UTC",
        ),
      ) + 59000,
    );
    draft = {
      propertyId: p?.id ?? "",
      label: "",
      notes: "",
      checkinLink: "",
      instructionsLink: "",
      grants: doors
        .filter((d) => d.propertyId === p?.id && d.common)
        .map((d) => ({
          doorId: d.id,
          start: start.toISOString(),
          end: end.toISOString(),
          singleUse: d.singleUse,
        })),
      breakfast: null,
      ...value,
    };
    editing = true;
    tab = "Codes";
  }
  function selectDoor(d: any, selected: boolean) {
    if (selected) {
      const now = new Date(),
        end = new Date();
      const p = properties.find((p) => p.id === draft.propertyId);
      end.setTime(
        Date.parse(
          wallTime(
            new Intl.DateTimeFormat("en-CA", {
              timeZone: p?.timezone ?? "UTC",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(now),
            "23:59",
            p?.timezone ?? "UTC",
          ),
        ) + 59000,
      );
      draft.grants = [
        ...draft.grants,
        {
          doorId: d.id,
          start: now.toISOString(),
          end: end.toISOString(),
          singleUse: d.singleUse,
        },
      ];
    } else draft.grants = draft.grants.filter((g) => g.doorId !== d.id);
  }
  function dateInput(iso: string) {
    if (!iso) return "";
    const zone =
      properties.find((p) => p.id === draft.propertyId)?.timezone ?? "UTC";
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date(iso))
      .replace(" ", "T");
  }
  function changeDate(g: any, key: "start" | "end", value: string) {
    try {
      g[key] = wallTime(
        value.slice(0, 10),
        value.slice(11, 16),
        properties.find((p) => p.id === draft.propertyId)?.timezone ?? "UTC",
      );
    } catch (e) {
      error = (e as Error).message;
    }
  }
  async function save() {
    const data = codeSchema.parse(draft);
    if (
      duplicateCodes.length &&
      !confirm(
        t("An identical access code already exists. Create another anyway?"),
      )
    )
      return;
    if (
      tourVisible &&
      tourStage === "code" &&
      !editId &&
      !data.grants.some((g) => g.doorId === tourDoorId)
    )
      throw Error("Select your example door before saving this access code.");
    const savedCode = await api(
      "codes" + (editId ? "/" + editId : ""),
      data,
      editId ? "PUT" : "POST",
    );
    localStorage.removeItem("oshost.draft." + user.id);
    editing = false;
    search = "";
    codeDate = "";
    codeStatus = "all";
    await reload();
    notice = "Access code saved. The guest link is ready to share.";
    if (tourVisible && tourStage === "code" && !editId) {
      tourCodeId = savedCode.id ?? editId;
      tourStage = "done";
    }
  }
  function edit(c: any) {
    draft = JSON.parse(
      JSON.stringify({
        propertyId: c.propertyId,
        label: c.label,
        notes: c.notes,
        checkinLink: c.checkinLink,
        instructionsLink: c.instructionsLink,
        grants: c.grants.map((g: any) => ({
          doorId: g.doorId,
          start: g.start,
          end: g.end,
          singleUse: g.singleUse,
          active: g.active !== false,
        })),
        breakfast: c.breakfast,
      }),
    );
    editId = c.id;
    tab = "Codes";
    detailCodeId = "";
    editing = true;
  }
  async function copy(text: string) {
    notice = "";
    error = "";
    const copied = await copyText(text);
    if (copied) notice = "Copied to clipboard.";
    else {
      manualCopy = text;
      copyDialog = true;
    }
  }
  async function enablePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window))
      throw Error(
        "Push is unavailable here. On iPhone, install this app on the Home Screen first.",
      );
    const p = await Notification.requestPermission();
    permission = p;
    if (p !== "granted")
      throw Error(
        "Notifications were not permitted; the activity feed remains available.",
      );
    const { key } = await api("push/key");
    if (!key) throw Error("The server needs VAPID keys before enabling push.");
    const sw = await navigator.serviceWorker.ready;
    const existing = await sw.pushManager.getSubscription();
    const subscription =
      existing ??
      (await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(
          atob(key.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        ),
      }));
    await api("push/subscriptions", {
      subscription: subscription.toJSON(),
      properties: pushProperties,
      events: pushEvents
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    notice = "Notification preferences saved.";
  }

  const navigation = [
    { name: "Codes", icon: KeyRound },
    { name: "Doors", icon: DoorOpen },
    { name: "Create", icon: Plus },
    { name: "Activity", icon: Activity },
    { name: "Settings", icon: Settings },
  ];
  const tools = [
    {
      name: "Connectors",
      icon: Plug,
      description: "Prefill a code from KrossBooking, a calendar or an image",
    },
    {
      name: "Messages",
      icon: MessageSquare,
      description: "Prepare and copy guest messages",
    },
    {
      name: "Reports",
      icon: ChartNoAxesColumn,
      description: "See code creation and usage",
    },
  ];
  let doorEditor = $state(false),
    tourVisible = $state(false);
  let tourStage = $state<"property" | "door" | "code" | "done" | "blocked">(
    "property",
  );
  let tourDoorId = $state(""),
    tourCodeId = $state(""),
    resumeTourDraft = false;
  const isSubpage = $derived(
    editing ||
      !!detailCodeId ||
      doorEditor ||
      !!detailDoorId ||
      !!settingsPage ||
      ["Messages", "Reports", "Connectors", "Profile"].includes(tab),
  );
  const pageTitle = $derived(
    tab === "Settings" && settingsPage
      ? propertyForm
        ? pEditing
          ? "Edit property"
          : "Add property"
        : (currentSetting?.title ?? "Settings")
      : tab === "Codes"
        ? editing
          ? editId
            ? "Edit access code"
            : "Create access code"
          : detailCode
            ? detailCode.label
            : "Access codes"
        : tab === "Doors"
          ? doorEditor
            ? editingDoor
              ? "Edit door"
              : "Add door"
            : detailDoorId
              ? (doors.find((d) => d.id === detailDoorId)?.name ?? "Doors")
              : "Doors"
          : tab === "Messages"
            ? "Message templates"
            : tab === "Connectors" && connectorView !== "list"
              ? {
                  kross: "KrossBooking",
                  ical: "Calendars",
                  gemini: "Image import",
                }[connectorView]
              : tab,
  );
  const tourTitle = $derived(
    tourStage === "property"
      ? "Create your first property"
      : tourStage === "door"
        ? "Add your first door"
        : tourStage === "code"
          ? "Create your first access code"
          : tourStage === "done"
            ? "Your first access code is ready"
            : "Your owner sets up the property",
  );
  const tourTarget = $derived(
    tourStage === "property"
      ? tab !== "Settings"
        ? '[data-tour="nav-settings"]'
        : settingsPage !== "properties"
          ? '[data-tour="nav-properties"]'
          : propertyForm
            ? '[data-tour="property-form"]'
            : '[data-tour="add-property"]'
      : tourStage === "door"
        ? tab === "Doors"
          ? doorEditor
            ? '[data-tour="door-form"]'
            : '[data-tour="add-door"]'
          : '[data-tour="nav-doors"]'
        : tourStage === "code"
          ? tab === "Codes" && editing && !editId
            ? '[data-tour="code-form"]'
            : '[data-tour="new-code"]'
          : tourStage === "done"
            ? `[data-code-id="${tourCodeId}"]`
            : '[data-tour="nav-doors"]',
  );
  const tourUnconnected = $derived(
    doors.find((d) => d.id === tourDoorId)?.integration === "none",
  );
  const tourText = $derived(
    tourStage === "property"
      ? tab === "Settings" && settingsPage !== "properties"
        ? t("Open Properties to set up your first structure.")
        : tab === "Settings" && !propertyForm
          ? t("Click Add property to give your structure a name and timezone.")
          : tab === "Settings"
            ? t(
                "Give your property a name, confirm its timezone and save it with Add property. The guide continues only after it is saved.",
              )
            : t(
                "Click the highlighted Settings button. We’ll create your property first, then an example door and an access code. You’ll save each item yourself.",
              )
      : tourStage === "door"
        ? tab !== "Doors"
          ? t(
              "Your property is ready. Click the highlighted Doors button to add an example door. You will add a device connector later.",
            )
          : !doorEditor
            ? t(
                "Click Add door. Give it a name such as “Example entrance”. You will add a device connector later, so no device account or credentials are needed now.",
              )
            : t(
                "Name your example door, leave Integration on Connect later, and click Save door. You will add a device connector later; this door cannot unlock anything yet.",
              )
        : tourStage === "code"
          ? tab === "Codes" && editing && !editId
            ? t(
                "Enter a guest name, select your door below, and review its validity times. Breakfast is optional. Click Save access code when you’re ready.",
              ) +
              (tourUnconnected
                ? t(
                    " The example door stays inactive until you add its connector.",
                  )
                : "")
            : t(
                "Your example door is ready. Click the highlighted + button to create an access code. Existing properties and doors are reused when you replay this guide.",
              )
          : tourStage === "done"
            ? t(
                "Your access code is saved. Use Copy link on the highlighted card to share it.",
              ) +
              (tourUnconnected
                ? t(
                    " You will add a device connector later by editing the door in Doors; until then, guests cannot open the example door.",
                  )
                : t(
                    " You can manage its permissions and revoke the link from this card.",
                  ))
            : t(
                "Ask an owner to add a property and a door. You can explore Doors now, or skip this guide and return using the ? button once setup is ready.",
              ),
  );
  function navigate(destination: string) {
    tab = destination;
    settingsPage = "";
    propertyForm = false;
    connectorView = "list";
    detailCodeId = "";
    detailDoorId = "";
    quickCreate = false;
    editing = false;
    doorEditor = false;
    error = "";
    notice = "";
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function startTour() {
    if (!user || !navigator.onLine) return;
    if (!user.preferences?.language) {
      suggestedLocale = navigator.language.toLowerCase().startsWith("it")
        ? "it"
        : "en";
      languagePrompt = true;
      return;
    }
    beginTour();
  }
  function confirmLanguage(locale: HostLocale, start: boolean) {
    void act(async () => {
      await chooseLanguage(locale);
      languagePrompt = false;
      if (start) beginTour();
      else await endTour("skipped");
    });
  }
  function beginTour() {
    tourCodeId = "";
    resumeTourDraft = editing && !editId;
    const current =
      properties.find(
        (p) => p.id === (editing ? draft.propertyId : propertyId),
      ) ?? properties[0];
    if (current) propertyId = current.id;
    setTourProperty(current?.id ?? "");
    if (
      tourStage === "property" &&
      tab === "Settings" &&
      settingsPage !== "properties"
    )
      settingsPage = "";
    tourVisible = true;
  }
  function setTourProperty(id: string) {
    const current = properties.find((p) => p.id === id);
    const currentDraftDoor =
      editing && draft.propertyId === id
        ? doors.find(
            (d) =>
              d.propertyId === id &&
              draft.grants.some((g) => g.doorId === d.id),
          )
        : null;
    const door =
      currentDraftDoor ??
      doors.find((d) => d.propertyId === id && d.integration === "none") ??
      doors.find((d) => d.propertyId === id);
    tourDoorId = door?.id ?? "";
    tourStage = !current ? "property" : !door ? "door" : "code";
    if (user.role !== "owner" && tourStage !== "code") tourStage = "blocked";
  }
  function changeTourProperty(id: string) {
    if (!tourVisible) return;
    if (editing && !editId) {
      draft.propertyId = id;
      draft.grants = [];
    }
    propertyId = id;
    setTourProperty(id);
  }
  async function endTour(result: "completed" | "skipped" = "skipped") {
    const accountId = user?.id;
    tourVisible = false;
    resumeTourDraft = false;
    try {
      await preferences({ tour: result });
    } catch (e) {
      if (user?.id !== accountId) return;
      error = t(
        "Tour preference could not be saved. Reconnect and dismiss the tour again.",
      );
      tourVisible = true;
    }
  }
  function propertySaved(id: string) {
    if (tourVisible && tourStage === "property") {
      propertyId = id;
      tourStage = "door";
    }
  }
  function doorSaved(id: string) {
    if (tourVisible && tourStage === "door") {
      tourDoorId = id;
      tourStage = "code";
    }
  }
</script>

<svelte:head
  ><title>{t("oshost · Host workspace")}</title><meta
    name="description"
    content="Your properties, doors and guest access in one place."
  /></svelte:head
>
{#if !ready}<div class="auth">{t("Opening your workspace…")}</div>
{:else if !user}<main class="auth">
    <p class="muted">{t("oshost / host workspace")}</p>
    <h1>
      {t(
        needsSetup
          ? "Set up your workspace"
          : invite
            ? "Join your team"
            : "Welcome back",
      )}
    </h1>
    <p class="muted">{t("Simple, secure guest access.")}</p>
    {#if error}<p class="error" role="alert">{t(error)}</p>{/if}
    <form
      class="card stack"
      onsubmit={(e) => {
        e.preventDefault();
        void act(login);
      }}
    >
      {#if needsSetup || invite}<label
          >{t("Your name")}<input
            bind:value={name}
            required
            autocomplete="name"
          /></label
        >{/if}{#if needsSetup}<label
          >{t("Setup token")}<input
            bind:value={setupToken}
            type="password"
            required
          /></label
        >{/if}<label
        >{t("Email")}<input
          bind:value={email}
          type="email"
          required
          autocomplete="username"
        /></label
      ><label
        >{t("Password")}<input
          bind:value={password}
          type="password"
          required
          minlength={needsSetup || invite ? 12 : 1}
          autocomplete={needsSetup || invite
            ? "new-password"
            : "current-password"}
        /></label
      ><button class="primary" disabled={busy}
        >{t(
          needsSetup ? "Create workspace" : invite ? "Join team" : "Sign in",
        )}</button
      >
    </form>
  </main>
{:else}<div class="shell">
    <header class="app-header">
      <div class="header-inner">
        <div class="header-title">
          {#if isSubpage}<button
              class="icon-button"
              aria-label={t("Back")}
              onclick={back}><ArrowLeft size={21} /></button
            >{/if}
          <h1>{t(pageTitle)}</h1>
        </div>
        <div class="row header-actions">
          <button
            class="icon-button"
            aria-label={t("Take the app tour")}
            title={t("Take the app tour")}
            onclick={startTour}><CircleHelp size={20} /></button
          ><button
            class="icon-button"
            aria-label={t("Profile")}
            onclick={() => navigate("Profile")}><UserRound size={21} /></button
          >
        </div>
      </div>
    </header>
    <LanguageChoice
      open={languagePrompt}
      suggested={suggestedLocale}
      onconfirm={confirmLanguage}
    />
    <nav class="app-nav" aria-label={t("Main navigation")}>
      {#each navigation as item (item.name)}
        {#if item.name === "Create"}<button
            class="quick-create"
            data-tour="new-code"
            aria-label={t("Create access code")}
            disabled={!propertyId || busy}
            onclick={() => (tourVisible ? newCode() : (quickCreate = true))}
            ><Plus size={25} /></button
          >
        {:else}<button
            class:active={tab === item.name ||
              (item.name === "Settings" &&
                ["Connectors", "Messages", "Reports", "Profile"].includes(tab))}
            aria-current={tab === item.name ? "page" : undefined}
            data-tour={"nav-" + item.name.toLowerCase()}
            onclick={() => navigate(item.name)}
            ><item.icon size={21} /><span>{t(item.name)}</span></button
          >{/if}
      {/each}
    </nav>
    <main class:settings-index={tab === "Settings" && !settingsPage}>
      {#if properties.length && !editing && !doorEditor && !detailCodeId && !detailDoorId && !(tab === "Settings" && ["appearance", "language", "team", "data", "notifications"].includes(settingsPage)) && tab !== "Profile"}
        <div class="property-switch">
          <Building2 size={16} /><select
            aria-label={t("Property")}
            bind:value={propertyId}
            onchange={() => changeTourProperty(propertyId)}
            >{#each properties as p (p.id)}<option value={p.id}>{p.name}</option
              >{/each}</select
          >
        </div>{/if}
      <Tour
        open={tourVisible}
        stage={tourStage}
        title={t(tourTitle)}
        text={tourText}
        target={tourTarget}
        onfinish={(result) => void endTour(result)}
      />

      {#if error}<div class="error row spread" role="alert">
          <span>{t(error)}</span><button
            class="icon-button"
            aria-label={t("Dismiss")}
            onclick={() => (error = "")}><X size={17} /></button
          >
        </div>{/if}{#if notice}<div class="toast" role="status">
          <Check size={17} /><span>{t(notice)}</span><button
            class="icon-button"
            aria-label={t("Dismiss")}
            onclick={() => (notice = "")}><X size={16} /></button
          >
        </div>{/if}
      {#if tab === "Codes"}
        {#if editing}<form
            data-tour="code-form"
            class="stack"
            onsubmit={(e) => {
              e.preventDefault();
              void act(save);
            }}
          >
            <div class="card stack">
              <div class="row spread">
                <h2>{t(editId ? "Edit access code" : "Create access code")}</h2>
                <button
                  type="button"
                  onclick={() => {
                    editing = false;
                    localStorage.removeItem("oshost.draft." + user.id);
                  }}>{t("Discard")}</button
                >
              </div>
              <div class="grid">
                <label
                  >{t("Guest name / label")}<input
                    bind:value={draft.label}
                    required
                    placeholder={t("e.g. Maria Rossi")}
                  /></label
                ><label
                  >{t("Property")}<select
                    bind:value={draft.propertyId}
                    onchange={() => {
                      draft.grants = [];
                      if (tourVisible) changeTourProperty(draft.propertyId);
                    }}
                    >{#each properties as p, index (p.id ?? index)}<option
                        value={p.id}>{p.name}</option
                      >{/each}</select
                  ></label
                >
              </div>
              <label
                >{t("Internal notes")}<textarea bind:value={draft.notes}
                ></textarea></label
              >
              <div class="grid">
                <label
                  >{t("Online check-in link")}<input
                    bind:value={draft.checkinLink}
                    type="url"
                  /></label
                ><label
                  >{t("Instructions link")}<input
                    bind:value={draft.instructionsLink}
                    type="url"
                  /></label
                >
              </div>
            </div>
            <div class="card">
              <h2>{t("Door permissions")}</h2>
              <p class="muted">
                {t("Times use")}
                {properties.find((p) => p.id === draft.propertyId)?.timezone}{t(
                  ". Each door has its own rules.",
                )}
              </p>
              {#each doors.filter((d) => d.propertyId === draft.propertyId) as d, index (d.id ?? index)}{@const grant =
                  draft.grants.find((g) => g.doorId === d.id)}
                <div class="door">
                  <label class="inline"
                    ><input
                      type="checkbox"
                      checked={!!grant}
                      onchange={(e) => selectDoor(d, e.currentTarget.checked)}
                    />{d.name}{d.common ? " · " + t("Common door") : ""}</label
                  >{#if grant}<div class="grid" style="margin-top:14px">
                      <label
                        >{t("Valid from")}<input
                          type="datetime-local"
                          value={dateInput(grant.start)}
                          onchange={(e) =>
                            changeDate(grant, "start", e.currentTarget.value)}
                          required
                        /></label
                      ><label
                        >{t("Valid until")}<input
                          type="datetime-local"
                          value={dateInput(grant.end)}
                          onchange={(e) =>
                            changeDate(grant, "end", e.currentTarget.value)}
                          required
                        /></label
                      ><label class="inline"
                        ><input
                          type="checkbox"
                          bind:checked={grant.singleUse}
                        />{t("Single use")}</label
                      >
                    </div>{/if}
                </div>{/each}{#if !doors.length}<p>
                  {t(
                    "Add a property in Settings, then connect a door in Doors.",
                  )}
                </p>{/if}
            </div>
            <div class="card stack">
              <label class="inline"
                ><input
                  type="checkbox"
                  checked={!!draft.breakfast}
                  onchange={(e) =>
                    (draft.breakfast = e.currentTarget.checked
                      ? { total: 1, start: date, end: date }
                      : null)}
                />{t("Include breakfast")}</label
              >{#if draft.breakfast}<div class="grid">
                  <label
                    >{t("Total breakfasts")}<input
                      type="number"
                      min="0"
                      bind:value={draft.breakfast.total}
                      required
                    /></label
                  ><label
                    >{t("First breakfast date")}<input
                      type="date"
                      bind:value={draft.breakfast.start}
                      required
                    /></label
                  ><label
                    >{t("Last breakfast date")}<input
                      type="date"
                      bind:value={draft.breakfast.end}
                      required
                    /></label
                  >
                </div>{/if}
            </div>
            {#if duplicateCodes.length}<p class="notice" role="status">
                {t(
                  "An identical access code already exists. Saving requires confirmation.",
                )}
              </p>{/if}
            <button class="primary" disabled={busy || !draft.propertyId}
              >{t("Save access code")}</button
            ><small
              >{t(
                "Active permissions are published after the server confirms this save.",
              )}</small
            >
          </form>
        {:else if detailCode}
          <article class="card stack" data-code-id={detailCode.id}>
            <div class="row spread">
              <h2>{detailCode.label}</h2>
              <span class="badge">{t(statusOf(detailCode))}</span>
            </div>
            <p>{detailCode.notes}</p>
            <small
              >{t("Created by")}
              {detailCode.creatorName ??
                users.find((u) => u.id === detailCode.creator)?.name ??
                t("Former staff")} · {formatInstant(
                detailCode.created,
                detailCode.propertyId,
              )}</small
            >
            <div class="detail-actions">
              <button
                class="primary"
                disabled={!!detailCode.revoked}
                onclick={() => act(() => prepareShare(detailCode))}
                ><Share2 size={17} />{t("Prepare message")}</button
              ><button onclick={() => edit(detailCode)}
                ><Pencil size={17} />{t("Edit")}</button
              ><a
                class="button"
                href={detailCode.link}
                target="_blank"
                rel="noreferrer"
                ><ExternalLink size={17} />{t("Visit guest page")}</a
              >
            </div>
            <section class="copy-fields">
              <label
                >{t("Access code")}
                <div class="input-action">
                  <input
                    readonly
                    value={guestToken(detailCode.link)}
                    aria-label={t("Access code value")}
                  /><button
                    disabled={!!detailCode.revoked}
                    onclick={() => void copy(guestToken(detailCode.link))}
                    ><Copy size={16} />{t("Copy code")}</button
                  >
                </div></label
              ><label
                >{t("Guest link")}
                <div class="input-action">
                  <input
                    readonly
                    value={detailCode.link}
                    aria-label={t("Guest link value")}
                  /><button
                    disabled={!!detailCode.revoked}
                    onclick={() => void copy(detailCode.link)}
                    ><Link size={16} />{t("Copy link")}</button
                  >
                </div></label
              >
            </section>
            <h3>{t("Door permissions")}</h3>
            {#each detailCode.grants as g (g.doorId)}<section
                class="door stack"
              >
                <div class="row spread">
                  <strong>{doors.find((d) => d.id === g.doorId)?.name}</strong
                  ><span class="badge">{t(grantStatus(g))}</span>
                </div>
                <p>
                  {formatInstant(g.start, detailCode.propertyId)} → {formatInstant(
                    g.end,
                    detailCode.propertyId,
                  )}<br /><small
                    >{properties.find((p) => p.id === detailCode.propertyId)
                      ?.timezone}</small
                  >
                </p>
                <small
                  >{t("Successful requests")}: {g.used} · {t(
                    g.singleUse ? "Single use" : "Multiple uses",
                  )}</small
                >
                <button
                  disabled={busy || !!detailCode.revoked}
                  onclick={() =>
                    act(async () => {
                      await api(
                        `codes/${detailCode.id}/grants/${g.doorId}`,
                        { active: g.active === false },
                        "PATCH",
                      );
                      await reload();
                    })}
                  >{t(
                    g.active === false
                      ? "Resume permission"
                      : "Pause permission",
                  )}</button
                >
                {#if g.claim}<div class="error">
                    <p>
                      {t("Uncertain device request:")}
                      {t("Check the door before allowing another request.")}
                    </p>
                    <div class="row">
                      <button
                        onclick={() =>
                          act(async () => {
                            await api(`codes/${detailCode.id}/resolve`, {
                              doorId: g.doorId,
                              consumed: true,
                            });
                            await reload();
                          })}>{t("Mark consumed")}</button
                      ><button
                        onclick={() =>
                          act(async () => {
                            await api(`codes/${detailCode.id}/resolve`, {
                              doorId: g.doorId,
                              consumed: false,
                            });
                            await reload();
                          })}>{t("Permit retry")}</button
                      >
                    </div>
                  </div>{/if}
              </section>{/each}
            {#if detailCode.breakfast}<section>
                <h3>{t("Breakfast")}</h3>
                <p>
                  {detailCode.breakfastUsed} / {detailCode.breakfast.total} · {detailCode
                    .breakfast.start} → {detailCode.breakfast.end}
                </p>
              </section>{/if}
            <details class="manage-access">
              <summary>{t("Manage access")}</summary>
              <p class="muted">
                {t("Replacing or revoking a link takes effect immediately.")}
              </p>
              <div class="row">
                <button
                  disabled={!!detailCode.revoked || busy}
                  onclick={() => act(() => replaceLink(detailCode))}
                  >{t("Replace link")}</button
                ><button
                  class="danger"
                  disabled={!!detailCode.revoked || busy}
                  onclick={() => act(() => revoke(detailCode))}
                  >{t("Revoke")}</button
                >
              </div>
            </details>
          </article>
        {:else}
          <div class="list-toolbar">
            <div class="search-field">
              <Search size={18} /><input
                aria-label={t("Search codes")}
                placeholder={t("Search guest access…")}
                bind:value={search}
              />
            </div>
            <button
              class="primary"
              onclick={() => newCode()}
              disabled={!propertyId}
              ><Plus size={17} /><span>{t("New code")}</span></button
            >
          </div>
          <div class="calendar-bar">
            <button
              class="icon-button"
              aria-label={t("Previous day")}
              onclick={() => shiftDay(-1)}><ChevronLeft size={18} /></button
            ><label class="date-filter"
              ><CalendarDays size={17} /><input
                aria-label={t("Valid on date")}
                type="date"
                bind:value={codeDate}
              /></label
            ><button
              class="icon-button"
              aria-label={t("Next day")}
              onclick={() => shiftDay(1)}><ChevronRight size={18} /></button
            ><button
              class="quiet"
              onclick={() =>
                (codeDate = dayAt(new Date().toISOString(), propertyId))}
              >{t("Today")}</button
            ><button
              class="quiet"
              class:selected={!codeDate}
              onclick={() => (codeDate = "")}>{t("All dates")}</button
            ><button
              class="icon-button"
              aria-label={t("Filters")}
              title={t("Filters")}
              aria-expanded={filtersOpen}
              onclick={() => (filtersOpen = !filtersOpen)}
              ><ListFilter size={17} />{codeStatus !== "all" ? "1" : ""}</button
            >
          </div>
          {#if filtersOpen}<div class="filter-panel">
              <label
                >{t("Status")}<select
                  aria-label={t("Status")}
                  bind:value={codeStatus}
                  ><option value="all">{t("All codes")}</option
                  >{#each ["Valid now", "Upcoming", "Expired", "Revoked", "No available doors"] as state (state)}<option
                      value={state}>{t(state)}</option
                    >{/each}</select
                ></label
              ><button
                class="quiet"
                onclick={() => {
                  codeDate = "";
                  codeStatus = "all";
                  search = "";
                }}>{t("Clear filters")}</button
              >
            </div>{/if}
          <div class="code-list item-group">
            {#each filtered as c (c.id)}<article
                class="code-row"
                data-code-id={c.id}
              >
                <button
                  class="code-summary"
                  onclick={() => (detailCodeId = c.id)}
                  ><span class="row"
                    ><strong>{c.label}</strong>{#if c.revoked}<span
                        class="badge">{t("Revoked")}</span
                      >{:else if c.grants.some((g: any) => g.claim)}<span
                        class="badge attention">{t("Needs review")}</span
                      >{/if}</span
                  ><span class="muted validity">{codeRange(c)}</span><span
                    class="row badges"
                    >{#each c.grants.slice(0, 3) as g (g.doorId)}<span
                        class="badge"
                        >{doors.find((d) => d.id === g.doorId)?.name}</span
                      >{/each}{#if c.grants.length > 3}<span class="badge"
                        >+{c.grants.length - 3}</span
                      >{/if}{#if c.breakfast}<span class="muted"
                        ><Coffee size={13} />
                        {c.breakfast.total - c.breakfastUsed}</span
                      >{/if}</span
                  ></button
                >
                <div class="row row-actions">
                  <button
                    class="icon-button"
                    aria-label={t("Copy link")}
                    title={t("Copy link")}
                    disabled={!!c.revoked}
                    onclick={() => void copy(c.link)}><Link size={19} /></button
                  ><button
                    class="icon-button"
                    aria-label={t("Prepare message")}
                    title={t("Prepare message")}
                    disabled={!!c.revoked}
                    onclick={() => act(() => prepareShare(c))}
                    ><Share2 size={19} /></button
                  >
                </div>
              </article>{:else}<div class="empty-state">
                <KeyRound size={36} />
                <h2>
                  {t(
                    search || codeDate || codeStatus !== "all"
                      ? "No matching codes"
                      : "Your next guest starts here",
                  )}
                </h2>
                <p>
                  {t(
                    "Create a link with just the doors and breakfast allowance they need.",
                  )}
                </p>
                {#if !propertyId}{#if user.role === "owner"}<button
                      onclick={() => openSettings("properties")}
                      >{t("Set up a property")}</button
                    >{:else}<p>
                      {t("Ask an owner to set up a property and its doors.")}
                    </p>{/if}{:else if search || codeDate || codeStatus !== "all"}<button
                    onclick={() => {
                      search = "";
                      codeDate = "";
                      codeStatus = "all";
                    }}>{t("Clear filters")}</button
                  >{:else}<button
                    onclick={() => newCode()}
                    disabled={!propertyId}>{t("Create access code")}</button
                  >{/if}
              </div>{/each}
          </div>{/if}
      {:else if tab === "Activity"}<div class="row spread">
          <p class="muted">
            {t("Access attempts, device responses and breakfast usage.")}
          </p>
          <Button onclick={() => act(reload)}>{t("Refresh")}</Button>
        </div>
        {#each events.filter((e) => !e.property_id || e.property_id === propertyId) as e, index (e.id ?? index)}<article
            class="card"
          >
            <div class="row spread">
              <strong>{e.type}</strong><small
                >{new Date(e.created).toLocaleString(
                  hostLanguage.current,
                )}</small
              >
            </div>
            <p>{e.message}</p>
            {#if e.code_id}<small
                >{codes.find((c) => c.id === e.code_id)?.label}</small
              >{/if}
          </article>{/each}
      {:else if tab === "Reports"}<div class="card">
          <h2>{t("Code creation and usage")}</h2>
          <p class="muted">
            {t(
              "Grouped by creation month in the property timezone. Attempts and accepted requests are lifetime totals for those codes.",
            )}
          </p>
          <table>
            <thead
              ><tr
                ><th>{t("Host / month")}</th><th>{t("Created")}</th><th
                  >{t("Used")}</th
                ><th>{t("Attempts")}</th><th>{t("Accepted")}</th></tr
              ></thead
            ><tbody
              >{#each stats as s, index (s.name + s.month)}<tr
                  ><td>{s.name}<br /><small>{s.month}</small></td><td
                    >{s.created}</td
                  ><td>{s.used}</td><td>{s.attempts}</td><td>{s.accepted}</td
                  ></tr
                >{/each}</tbody
            >
          </table>
        </div>
      {:else if tab === "Connectors"}<ConnectorManager
          {api}
          {reload}
          {connections}
          {propertyId}
          {doors}
          {property}
          owner={user.role === "owner"}
          onDraft={newCode}
          bind:view={connectorView}
        />
      {:else if tab === "Messages"}<div class="page-intro">
          <p>{t("Personalize what you share with guests")}</p>
        </div>
        <div class="grid form-controls">
          <label
            >{t("Language")}<select
              aria-label={t("Template language")}
              bind:value={templateLang}
              ><option value="en">English</option><option value="it"
                >Italiano</option
              ></select
            ></label
          ><label
            >{t("Message")}<select
              aria-label={t("Template type")}
              bind:value={templateKind}
              ><option value="access">{t("Access link")}</option><option
                value="checkin">{t("Check-in")}</option
              ><option value="instructions">{t("Instructions")}</option></select
            ></label
          >
        </div>
        <div class="card stack">
          <h2>{t("Property templates")}</h2>
          <small
            >{t("Placeholders:")}
            {"{{guest}}, {{link}}, {{checkinLink}}, {{instructionsLink}}, {{host}}"}</small
          ><textarea
            disabled={busy || templatesLoading}
            bind:this={templateInput}
            aria-label={t("Message template")}
            bind:value={templates[templateLang][templateKind]}></textarea>
          <div class="row">
            {#each ["guest", "link", "checkinLink", "instructionsLink", "host"] as key (key)}<button
                disabled={busy || templatesLoading}
                onclick={() => insertPlaceholder(key)}
                >{"{{" + key + "}}"}</button
              >{/each}
          </div>
          <button
            disabled={busy || templatesLoading}
            onclick={() => {
              if (
                confirm(
                  t(
                    "Reset this template to its default text? Save templates to publish the change.",
                  ),
                )
              )
                templates[templateLang][templateKind] =
                  defaultTemplates[templateLang as "en" | "it"][
                    templateKind as "access" | "checkin" | "instructions"
                  ];
            }}>{t("Reset to default")}</button
          >
          <h3>{t("Live sample preview")}</h3>
          <pre class="message-preview">{preview(
              templates[templateLang]?.[templateKind] ?? "",
              codes.find((c) => c.id === messageCode),
            )}</pre>
          <button
            disabled={busy || templatesLoading || !propertyId}
            onclick={() =>
              act(async () => {
                await api("templates/" + propertyId, templates, "PUT");
                notice = "Templates saved.";
              })}>{t("Save templates")}</button
          >
        </div>
      {:else if tab === "Doors"}<DoorManager
          {doors}
          {propertyId}
          propertyName={property?.name ?? ""}
          owner={user.role === "owner"}
          {api}
          {reload}
          onSaved={doorSaved}
          onSetup={() => navigate("Settings")}
          bind:editor={doorEditor}
          bind:editId={editingDoor}
          bind:detailId={detailDoorId}
        />
      {:else if tab === "Profile"}<section class="card stack">
          <h2>{t("Your account")}</h2>
          <label>{t("Your name")}<input readonly value={user.name} /></label
          ><label>{t("Email")}<input readonly value={user.email ?? ""} /></label
          >
          <p>{t("Role")}: {t(user.role)}</p>
          <small>{t("Account ID")}: {user.id}</small><button
            disabled={busy}
            onclick={() => act(logout)}
            ><LogOut size={17} />{t("Sign out")}</button
          >
        </section>
      {:else if tab === "Settings"}
        {#if !settingsPage}<div class="page-intro">
            <p>{t("Manage your workspace and preferences")}</p>
          </div>
          {#each ["Preferences", "Workspace", "Administration"] as group (group)}{@const items =
              settingItems.filter(
                (i) => i.group === group && (!i.owner || user.role === "owner"),
              )}{#if items.length}<section class="settings-group">
                <h2>{t(group)}</h2>
                <div class="item-group">
                  {#each items as item (item.id)}<button
                      class="settings-row"
                      data-tour={"nav-" + item.id}
                      onclick={() => openSettings(item.id)}
                      ><item.icon size={21} /><span
                        ><strong>{t(item.title)}</strong><small
                          >{t(item.description)}</small
                        ></span
                      ><ChevronRight size={18} /></button
                    >{/each}
                </div>
              </section>{/if}{/each}
          <div class="item-group">
            <button class="settings-row" onclick={startTour}
              ><CircleHelp size={21} /><span
                ><strong>{t("App tour")}</strong><small
                  >{t("A quick guide to your host workspace")}</small
                ></span
              ><ChevronRight size={18} /></button
            >
          </div>
        {:else if settingsPage === "appearance"}<div class="page-intro">
            <p>{t("Light, dark or follow your device")}</p>
          </div>
          <div class="theme-options" role="radiogroup" aria-label={t("Theme")}>
            {#each [{ id: "light", title: "Light", icon: Sun }, { id: "dark", title: "Dark", icon: Moon }, { id: "system", title: "System", icon: Monitor }] as option (option.id)}<button
                role="radio"
                aria-checked={theme === option.id}
                class:selected={theme === option.id}
                disabled={busy}
                onclick={() => act(() => preferences({ theme: option.id }))}
                ><span class={"theme-preview " + option.id}
                  ><span></span><span></span><span></span></span
                ><span class="row"
                  ><option.icon size={17} />{t(
                    option.title,
                  )}{#if theme === option.id}<Check size={16} />{/if}</span
                ></button
              >{/each}
          </div>
        {:else if settingsPage === "language"}<div class="page-intro">
            <p>
              {t(
                "Your choice is saved to your account across devices. Guest language is independent.",
              )}
            </p>
          </div>
          <div
            class="item-group"
            role="radiogroup"
            aria-label={t("App language")}
          >
            {#each [{ id: "it", name: "Italiano", detail: "Italian" }, { id: "en", name: "English", detail: "English" }] as language (language.id)}<button
                class="settings-row"
                role="radio"
                aria-checked={hostLanguage.current === language.id}
                disabled={busy}
                onclick={() =>
                  act(() => chooseLanguage(language.id as HostLocale))}
                ><span class="language-badge">{language.id.toUpperCase()}</span
                ><span
                  ><strong>{language.name}</strong><small
                    >{t(language.detail)}</small
                  ></span
                >{#if hostLanguage.current === language.id}<Check
                    size={19}
                  />{/if}</button
              >{/each}
          </div>
        {:else if settingsPage === "notifications"}
          <div class="card stack">
            <h2>{t("Notifications & installation")}</h2>
            <p class="muted">
              {t(
                "Install this app from your browser menu. On iPhone: Share → Add to Home Screen, then enable notifications here.",
              )}
            </p>
            <small
              >{t("Permission:")}
              {permission}{t(
                ". Leave filters empty to receive all activity.",
              )}</small
            >
            <div class="row">
              {#each properties as p, index (p.id ?? index)}<label
                  class="inline"
                  ><input
                    type="checkbox"
                    value={p.id}
                    bind:group={pushProperties}
                  />{p.name}</label
                >{/each}
            </div>
            <fieldset class="stack">
              <legend>{t("Notify me about")}</legend
              >{#each [["access.accepted", "Access accepted"], ["access.denied", "Access denied"], ["access.failed", "Device failures"], ["access.uncertain", "Uncertain requests"], ["access.invalid", "Invalid guest links"], ["breakfast.redeemed", "Breakfast usage"], ["breakfast.denied", "Rejected breakfasts"]] as option (option[0])}<label
                  class="inline"
                  ><input
                    type="checkbox"
                    checked={pushEvents.split(",").includes(option[0])}
                    onchange={(e) => {
                      const values = pushEvents
                        .split(",")
                        .filter(Boolean)
                        .filter((v) => v !== option[0]);
                      if (e.currentTarget.checked) values.push(option[0]);
                      pushEvents = values.join(",");
                    }}
                  />{t(option[1])}</label
                >{/each}
            </fieldset>
            <div class="row">
              <button onclick={() => act(enablePush)}
                >{t("Enable / update notifications")}</button
              ><button
                onclick={() =>
                  act(async () => {
                    await api("push/subscriptions", undefined, "DELETE");
                    if ("serviceWorker" in navigator) {
                      const r =
                        await navigator.serviceWorker.getRegistration("/host/");
                      await (
                        await r?.pushManager.getSubscription()
                      )?.unsubscribe();
                    }
                    notice = "Notifications disabled.";
                  })}>{t("Disable notifications")}</button
              >
            </div>
          </div>
        {:else if settingsPage === "properties"}
          {#if propertyForm && user.role === "owner"}<form
              data-tour="property-form"
              class="card stack"
              onsubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  const savedProperty = await api(
                    "properties" + (pEditing ? "/" + pEditing : ""),
                    {
                      name: pName,
                      timezone: pZone,
                      checkIn: pIn,
                      checkOut: pOut,
                    },
                    pEditing ? "PUT" : "POST",
                  );
                  propertySaved(savedProperty.id ?? pEditing);
                  pEditing = "";
                  pName = "";
                  propertyForm = false;
                  await reload();
                });
              }}
            >
              <h2>{t(pEditing ? "Edit property" : "Add property")}</h2>
              <div class="grid">
                <label>{t("Name")}<input bind:value={pName} required /></label
                ><label
                  >{t("Timezone")}<input
                    bind:value={pZone}
                    required
                    placeholder={t("Europe/Rome")}
                  /></label
                ><label
                  >{t("Default arrival time")}<input
                    type="time"
                    bind:value={pIn}
                    required
                  /></label
                ><label
                  >{t("Default departure time")}<input
                    type="time"
                    bind:value={pOut}
                    required
                  /></label
                >
              </div>
              <button>{t(pEditing ? "Save property" : "Add property")}</button>
            </form>
          {:else}<div class="section-intro row spread">
              <p class="muted">{t("Names, timezones and arrival defaults")}</p>
              {#if user.role === "owner"}<button
                  class="primary"
                  data-tour="add-property"
                  onclick={() => editProperty()}
                  ><Plus size={17} />{t("Add property")}</button
                >{/if}
            </div>
            <div class="item-group">
              {#each properties as p (p.id)}<button
                  class="settings-row"
                  disabled={user.role !== "owner"}
                  onclick={() => editProperty(p)}
                  ><Building2 size={21} /><span
                    ><strong>{p.name}</strong><small
                      >{p.timezone} · {p.checkIn} / {p.checkOut}</small
                    ></span
                  >{#if user.role === "owner"}<ChevronRight
                      size={18}
                    />{/if}</button
                >{:else}<div class="empty-state">
                  <Building2 size={32} />
                  <h2>{t("Add your property first")}</h2>
                  <p>{t("Then connect the doors guests will access.")}</p>
                </div>{/each}
            </div>{/if}
        {:else if settingsPage === "team" && user.role === "owner"}
          <div class="card stack">
            <h2>{t("Team")}</h2>
            <button
              onclick={() =>
                act(async () => {
                  invitationLink = (await api("invites", {})).link;
                })}>{t("Create invitation")}</button
            >{#if invitationLink}<div class="input-action">
                <input
                  readonly
                  aria-label={t("Invitation link")}
                  value={invitationLink}
                /><button onclick={() => void copy(invitationLink)}
                  ><Copy size={16} />{t("Copy invitation")}</button
                >
              </div>{/if}<small
              >{t(
                "Invitations expire after 24 hours and can be used once.",
              )}</small
            >{#each users as u, index (u.id ?? index)}<div class="row spread">
                <span>{u.name} · {t(u.role)}</span
                >{#if u.role === "staff"}<button
                    onclick={() =>
                      act(async () => {
                        if (
                          confirm(
                            "Remove this staff member and revoke their sessions?",
                          )
                        ) {
                          await api("users/" + u.id, undefined, "DELETE");
                          await reload();
                        }
                      })}>{t("Remove")}</button
                  >{/if}
              </div>{/each}
          </div>
        {:else if settingsPage === "breakfast"}<div class="page-intro">
            <p>
              {t(
                "Only aggregate totals are public. Guest details stay private.",
              )}
            </p>
          </div>
          <div class="item-group">
            {#each properties as p (p.id)}<a
                class="settings-row"
                href={"/breakfast/" + p.id}
                target="_blank"
                rel="noreferrer"
                ><Coffee size={21} /><span
                  ><strong>{p.name}</strong><small
                    >{t("Open public breakfast page ↗")}</small
                  ></span
                ><ExternalLink size={18} /></a
              >{/each}
          </div>
        {:else if settingsPage === "data" && user.role === "owner"}<div
            class="page-intro"
          >
            <p>
              {t(
                "Export a backup on the server before resetting the workspace.",
              )}
            </p>
          </div>
          <section class="card stack danger-zone">
            <h2>{t("Danger zone")}</h2>
            <p>
              {t(
                "Wipe the entire workspace database, including all users, properties, doors, photos, access codes, breakfast history, credentials, templates, activity and notification subscriptions. All guest links and sessions stop working. This cannot be undone without a backup.",
              )}
            </p>
            <p class="muted">
              {t("Server logs are retained after a database wipe.")}
            </p>
            <button
              class="danger"
              onclick={() => {
                wipeOpen = true;
                wipePassword = "";
                wipeConfirmation = "";
                wipeAcknowledged = false;
              }}>{t("Wipe database…")}</button
            >
            {#if wipeOpen}<form
                class="stack"
                onsubmit={(e) => {
                  e.preventDefault();
                  void act(wipeDatabase);
                }}
              >
                <p class="error">
                  {t(
                    "This deletes data for the whole team, not just your account. Back up the database and encryption keys first. You will need the server setup token to create a new owner. Server configuration, encryption keys and existing backups are not deleted.",
                  )}
                </p>
                <label class="inline"
                  ><input
                    type="checkbox"
                    bind:checked={wipeAcknowledged}
                    required
                  />{t(
                    "I have a backup or accept permanent data loss, and I have the setup token.",
                  )}</label
                >
                <label
                  >{t("Current password")}<input
                    type="password"
                    autocomplete="current-password"
                    bind:value={wipePassword}
                    required
                  /></label
                >
                <label
                  >{t("Type WIPE ALL DATA to confirm")}<input
                    bind:value={wipeConfirmation}
                    autocomplete="off"
                    required
                    pattern="WIPE ALL DATA"
                  /></label
                >
                <div class="row">
                  <button
                    type="button"
                    onclick={() => {
                      wipeOpen = false;
                      wipePassword = "";
                    }}>{t("Cancel")}</button
                  ><button
                    class="danger"
                    disabled={busy ||
                      !wipeAcknowledged ||
                      !wipePassword ||
                      wipeConfirmation !== "WIPE ALL DATA"}
                    >{t("Permanently wipe database")}</button
                  >
                </div>
              </form>{/if}
          </section>
        {:else}<p class="muted">{t("Choose a section from Settings.")}</p>{/if}
      {/if}
      <Modal
        open={!!shareCodeId}
        title={t("Prepare message")}
        onclose={() => (shareCodeId = "")}
        ><div class="stack">
          <p class="muted">{codes.find((c) => c.id === shareCodeId)?.label}</p>
          <div class="row">
            <label
              >{t("Language")}<select
                aria-label={t("Language")}
                disabled={busy}
                bind:value={shareLanguage}
                onchange={refreshShare}
                ><option value="en">English</option><option value="it"
                  >Italiano</option
                ></select
              ></label
            ><label
              >{t("Message")}<select
                aria-label={t("Message")}
                disabled={busy}
                bind:value={shareKind}
                onchange={refreshShare}
                ><option value="access">{t("Access link")}</option><option
                  value="checkin">{t("Check-in")}</option
                ><option value="instructions">{t("Instructions")}</option
                ></select
              ></label
            >
          </div>
          <textarea
            disabled={busy}
            aria-label={t("Message preview")}
            bind:value={shareText}
          ></textarea>{#if notice === "Copied to clipboard."}<p
              class="muted"
              role="status"
            >
              {t(notice)}
            </p>{/if}
          <div class="row">
            <button
              disabled={busy || !shareText}
              onclick={() => void copy(shareText)}>{t("Copy message")}</button
            >{#if navigator.share}<button
                disabled={busy || !shareText}
                onclick={() =>
                  act(async () => {
                    try {
                      await navigator.share({ text: shareText });
                    } catch (e) {
                      if ((e as Error).name !== "AbortError") throw e;
                    }
                  })}>{t("Share")}</button
              >{/if}
          </div>
        </div></Modal
      >
      <Modal
        open={quickCreate}
        title={t("Create")}
        onclose={() => (quickCreate = false)}
        ><div class="item-group">
          <button class="settings-row" onclick={() => newCode()}
            ><KeyRound size={22} /><span
              ><strong>{t("Create access code")}</strong><small
                >{t("Choose doors and share a guest link")}</small
              ></span
            ><ChevronRight size={18} /></button
          >{#if user.role === "owner"}<button
              class="settings-row"
              onclick={() => {
                navigate("Doors");
                editingDoor = "";
                doorEditor = true;
              }}
              ><DoorOpen size={22} /><span
                ><strong>{t("Add door")}</strong><small
                  >{t("Connect an entrance or room")}</small
                ></span
              ><ChevronRight size={18} /></button
            >{/if}
        </div></Modal
      >
      <Modal
        open={copyDialog}
        title={t("Copy manually")}
        onclose={() => {
          copyDialog = false;
          manualCopy = "";
        }}
        ><div class="stack">
          <p>
            {t(
              "Your browser could not copy automatically. Select the text below, then use Copy or press Ctrl/Cmd+C.",
            )}
          </p>
          <textarea
            bind:this={copyInput}
            readonly
            aria-label={t("Text to copy")}
            value={manualCopy}
            onfocus={(e) => e.currentTarget.select()}></textarea><button
            class="primary"
            onclick={() => {
              copyInput?.focus();
              copyInput?.select();
            }}>{t("Select text")}</button
          >
        </div></Modal
      >
      {#if busy}<p class="muted" role="status">{t("Working…")}</p>{/if}
    </main>
  </div>{/if}
