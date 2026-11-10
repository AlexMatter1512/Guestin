<script lang="ts">
  import {
    notificationText,
    wantsNotification,
    notificationTypes,
  } from "../../../../shared/notifications";
  import { connectLive } from "$lib/live";
  import { flip } from "svelte/animate";
  import AccessCalendar from "$lib/components/AccessCalendar.svelte";
  import * as Popover from "$lib/components/ui/popover";
  import { buttonVariants } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import GuestLinksSettings from "$lib/components/GuestLinksSettings.svelte";
  import InstallAppInfo from "$lib/components/InstallAppInfo.svelte";
  import JsonBackup from "$lib/components/JsonBackup.svelte";
  import {
    guestLinkDefaults,
    breakfastDefaults,
  } from "../../../../shared/draft-defaults";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";
  import * as Card from "$lib/components/ui/card";
  import * as Item from "$lib/components/ui/item";
  import * as NativeSelect from "$lib/components/ui/native-select";
  import * as Table from "$lib/components/ui/table";
  import { cn } from "$lib/utils";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import {
    KeyRound,
    DoorOpen,
    Plus,
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
    Download,
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
    ChevronLeft,
    Ellipsis,
    LogOut,
    ListFilter,
    Pencil,
  } from "@lucide/svelte";
  import StructureSettings from "$lib/components/StructureSettings.svelte";
  import NotificationHistory from "$lib/components/NotificationHistory.svelte";
  import ConnectorManager from "$lib/components/ConnectorManager.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import { copyText, guestToken } from "$lib/browser";
  import DoorManager from "$lib/components/DoorManager.svelte";
  import Tour from "$lib/components/Tour.svelte";
  import OnboardingDeviceSetup from "$lib/components/OnboardingDeviceSetup.svelte";
  import { appInstallation } from "$lib/app-installation.svelte";
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
    csrf = $state(""),
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
  const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  const browserThemeColor = $derived(
    (theme === "system" ? systemDark : theme === "dark")
      ? "#0a0a0a"
      : "#ffffff",
  );
  let copyInput = $state<HTMLTextAreaElement | null>(null);
  const settingItems = [
    {
      id: "install",
      title: "Install app",
      description: "Add oshost to your iPhone or Android Home Screen",
      icon: Download,
      group: "Preferences",
    },
    {
      id: "guest-links",
      title: "Guest links",
      description: "Default check-in and instructions links",
      icon: Link,
      group: "Workspace",
    },
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
      description: "KrossBooking, calendars and AI",
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
      title: "Breakfast",
      description: "Breakfast page and password protection",
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
      tab === "Codes" || tab === "Activity"
        ? "Codes"
        : tab === "Doors"
          ? "Doors"
          : "Settings",
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
  let templateInput = $state<HTMLTextAreaElement | null>(null);
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
    try {
      const saved = JSON.parse(
        localStorage.getItem("oshost.push." + user.id) ?? "null",
      );
      if (saved) {
        pushProperties = saved.properties ?? [];
        pushEvents = (saved.events ?? []).join(",");
        pushAllEvents = saved.allEvents ?? !saved.events?.length;
        pushAllProperties = saved.allProperties ?? !saved.properties?.length;
      } else {
        pushProperties = [];
        pushEvents = "";
        pushAllEvents = true;
        pushAllProperties = true;
      }
    } catch {
      pushProperties = [];
      pushEvents = "";
      pushAllEvents = true;
      pushAllProperties = true;
    }
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
      "Activity",
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
    if (found === "Activity" && id && properties.some((p) => p.id === id))
      propertyId = id;
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
      document.documentElement.classList.toggle(
        "dark",
        document.documentElement.dataset.theme === "dark",
      );
    }
  });
  $effect(() => {
    if (!routeReady || !user) return;
    let route = "/" + tab.toLowerCase();
    if (tab === "Activity" && propertyId) route += "/" + propertyId;
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
  let templates = $state<any>(structuredClone(defaultTemplates)),
    templatesLoading = $state(false),
    templateLang = $state("en"),
    templateKind = $state("access"),
    messageCode = $state(""),
    message = $state("");
  let pushProperties = $state<string[]>([]),
    pushEvents = $state(""),
    pushAllEvents = $state(true),
    pushAllProperties = $state(true),
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
  const activeCodeDate = $derived(
    codeDate || dayAt(new Date(currentTime).toISOString(), propertyId),
  );
  function codeOnDate(c: any, day: string) {
    return (
      c.grants.some(
        (g: any) =>
          dayAt(g.start, c.propertyId) <= day &&
          dayAt(new Date(Date.parse(g.end) - 1).toISOString(), c.propertyId) >=
            day,
      ) ||
      (c.breakfast && c.breakfast.start <= day && c.breakfast.end >= day) ||
      (!c.grants.length &&
        !c.breakfast &&
        dayAt(c.created, c.propertyId) === day)
    );
  }
  function dateHasCodes(day: string) {
    return codes.some((c) => c.propertyId === propertyId && codeOnDate(c, day));
  }
  const filtered = $derived(
    codes.filter(
      (c) =>
        (!propertyId || c.propertyId === propertyId) &&
        c.label.toLowerCase().includes(search.toLowerCase()) &&
        (codeStatus === "all" || statusOf(c) === codeStatus) &&
        codeOnDate(c, activeCodeDate),
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
    [properties, doors, codes, connections, reports] = await Promise.all(
      ["properties", "doors", "codes", "connections", "reports"].map((p) =>
        api(p),
      ),
    );
    if (!propertyId) propertyId = properties[0]?.id ?? "";
    if (user?.role === "owner") users = await api("users");
    if (user?.id && pushLoadedFor !== user.id) {
      pushLoadedFor = user.id;
      await restoreDevicePushPreferences();
    }
  }
  let liveRevision = $state(0);
  $effect(() => {
    const account = user?.id;
    if (!account || !csrf) return;
    let stopped = false;
    let refreshing = false;
    let pending = false;
    async function refreshLive() {
      pending = true;
      if (refreshing) return;
      refreshing = true;
      try {
        while (pending && !stopped) {
          pending = false;
          const [nextCodes, nextReports] = await Promise.all([
            api("codes"),
            api("reports"),
          ]);
          if (stopped || user?.id !== account) return;
          codes = nextCodes;
          reports = nextReports;
          liveRevision++;
        }
      } catch {
        /* Reconnection or the next event retries the snapshot. */
      } finally {
        refreshing = false;
      }
    }
    const disconnect = connectLive((message) => {
      if (stopped || user?.id !== account) return;
      void refreshLive();
      const event = message.event;
      if (
        message.type === "activity" &&
        event &&
        wantsNotification(
          {
            properties: pushProperties,
            allProperties: pushAllProperties,
            events: pushEvents.split(",").filter(Boolean),
            allEvents: pushAllEvents,
          },
          event.property_id,
          event.type,
        )
      ) {
        const text = notificationText(event, hostLanguage.current);
        notice = `${text.title}: ${text.body}`;
      }
    });
    return () => {
      stopped = true;
      disconnect();
    };
  });
  let pushLoadedFor = "";
  async function restoreDevicePushPreferences() {
    const account = user?.id;
    try {
      if (
        localStorage.getItem("oshost.push." + account) ||
        !("serviceWorker" in navigator) ||
        !globalThis.crypto?.subtle
      )
        return;
      const registration =
        await navigator.serviceWorker.getRegistration("/host/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return;
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(subscription.endpoint),
      );
      const id = [...new Uint8Array(bytes)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const records = await api("push/subscriptions");
      const saved = records.find((record: any) => record.id === id);
      if (saved && user?.id === account) {
        pushProperties = saved.properties ?? [];
        pushEvents = (saved.events ?? []).join(",");
        pushAllEvents = saved.allEvents ?? !saved.events?.length;
        pushAllProperties = saved.allProperties ?? !saved.properties?.length;
        localStorage.setItem("oshost.push." + account, JSON.stringify(saved));
      }
    } catch {
      /* Unsupported browsers keep local selection; history is always available. */
    }
  }
  onMount(() => {
    const stopInstallTracking = appInstallation.listen();
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
      stopInstallTracking();
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
    pushLoadedFor = "";
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
      ...guestLinkDefaults(p, value),
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
    codeDate = data.grants[0]
      ? dayAt(data.grants[0].start, data.propertyId)
      : (data.breakfast?.start ?? "");
    codeStatus = "all";
    await reload();
    notice = "Access code saved. The guest link is ready to share.";
    if (tourVisible && tourStage === "code" && !editId) {
      tourCodeId = savedCode.id ?? editId;
      tourStage = "install";
      await preferences({ tour: "pending", tourStep: "install", tourCodeId });
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
    if (
      !window.isSecureContext ||
      typeof Notification === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    )
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
    const sw = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              Error(
                "The app is not ready for notifications. Refresh and try again.",
              ),
            ),
          10000,
        ),
      ),
    ]);
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
      language: hostLanguage.current,
      allEvents: pushAllEvents,
      allProperties: pushAllProperties,
      properties: pushProperties,
      events: pushEvents
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    localStorage.setItem(
      "oshost.push." + user.id,
      JSON.stringify({
        properties: pushProperties,
        events: pushEvents.split(",").filter(Boolean),
        allEvents: pushAllEvents,
        allProperties: pushAllProperties,
      }),
    );
    notice = "Notification preferences saved.";
  }

  const navigation = [
    { name: "Codes", icon: KeyRound },
    { name: "Doors", icon: DoorOpen },
    { name: "Create", icon: Plus },
    { name: "Reports", label: "Statistics", icon: ChartNoAxesColumn },
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
  let tourStage = $state<
    | "property"
    | "door"
    | "code"
    | "install"
    | "notifications"
    | "done"
    | "blocked"
  >("property");
  let tourDoorId = $state(""),
    tourCodeId = $state(""),
    resumeTourDraft = false;
  const isSubpage = $derived(
    editing ||
      !!detailCodeId ||
      doorEditor ||
      !!detailDoorId ||
      !!settingsPage ||
      ["Messages", "Activity", "Connectors", "Profile"].includes(tab),
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
                  gemini: "AI",
                }[connectorView]
              : tab === "Reports"
                ? "Statistics"
                : tab === "Activity"
                  ? "Notifications"
                  : tab,
  );
  const tourTitle = $derived(
    tourStage === "property"
      ? "Create your first property"
      : tourStage === "door"
        ? "Add your first door"
        : tourStage === "code"
          ? "Create your first access code"
          : tourStage === "install"
            ? hostLanguage.current === "it"
              ? "Installa l’app host"
              : "Install the host app"
            : tourStage === "notifications"
              ? hostLanguage.current === "it"
                ? "Scegli le notifiche"
                : "Choose your notifications"
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
            : '[data-tour="new-code"]'
          : '[data-tour="nav-doors"]'
        : tourStage === "code"
          ? tab === "Codes" && editing && !editId
            ? '[data-tour="code-form"]'
            : '[data-tour="new-code"]'
          : tourStage === "install"
            ? '[data-tour="install-app"]'
            : tourStage === "notifications"
              ? '[data-tour="enable-notifications"]'
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
                "Click the highlighted + button. Give the door a name such as “Example entrance”. You will add a device connector later, so no device account or credentials are needed now.",
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
          : tourStage === "install"
            ? hostLanguage.current === "it"
              ? "Il primo codice è pronto. Usa l’area evidenziata per installare l’app o continuare senza installarla."
              : "Your first code is ready. Use the highlighted area to install the app or continue without installing."
            : tourStage === "notifications"
              ? hostLanguage.current === "it"
                ? "Scegli se ricevere notifiche su questo dispositivo. Tocca Attiva le notifiche solo se le desideri, oppure Continua."
                : "Choose whether this device can notify you. Click Enable notifications only if you want them, or Continue."
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
                    "Ask an owner to add a property and a door. You can explore Doors now, or skip this guide and return from App tour in Settings once setup is ready.",
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
    if (!editing) {
      try {
        const saved = localStorage.getItem("oshost.draft." + user.id);
        if (saved) {
          draft = JSON.parse(saved);
          const storedId =
            localStorage.getItem("oshost.draft.editId." + user.id) ?? "";
          editId = codes.some((code) => code.id === storedId) ? storedId : "";
          editing = true;
          tab = "Codes";
          settingsPage = "";
        }
      } catch {
        /* Ignore an invalid local draft; server records remain authoritative. */
      }
    }
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
    const resumeStep = user.preferences?.tourStep;
    const resumeCode = codes.find(
      (code) => code.id === user.preferences?.tourCodeId,
    );
    if (
      !editing &&
      resumeCode &&
      ["install", "notifications"].includes(resumeStep)
    ) {
      tourCodeId = resumeCode.id;
      tourDoorId = resumeCode.grants[0]?.doorId ?? "";
      tourStage = resumeStep;
      tab = "Codes";
      settingsPage = "";
    }
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
      await preferences({ tour: result, tourStep: null, tourCodeId: null });
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
  async function continueDeviceSetup() {
    if (tourStage === "install") {
      await preferences({ tourStep: "notifications", tourCodeId });
      tourStage = "notifications";
    } else if (tourStage === "notifications") {
      tourStage = "done";
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
  /><meta name="theme-color" content={browserThemeColor} /></svelte:head
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
      {#if needsSetup || invite}<Label class="field-label"
          >{t("Your name")}<Input
            bind:value={name}
            required
            autocomplete="name"
          /></Label
        >{/if}{#if needsSetup}<Label class="field-label"
          >{t("Setup token")}<Input
            bind:value={setupToken}
            type="password"
            required
          /></Label
        >{/if}<Label class="field-label"
        >{t("Email")}<Input
          bind:value={email}
          type="email"
          required
          autocomplete="username"
        /></Label
      ><Label class="field-label"
        >{t("Password")}<Input
          bind:value={password}
          type="password"
          required
          minlength={needsSetup || invite ? 12 : 1}
          autocomplete={needsSetup || invite
            ? "new-password"
            : "current-password"}
        /></Label
      ><Button type="submit" variant="default" class="primary" disabled={busy}
        >{t(
          needsSetup ? "Create workspace" : invite ? "Join team" : "Sign in",
        )}</Button
      >
    </form>
  </main>
{:else}<div class="shell">
    <header class="app-header">
      <div class="header-inner">
        <div class="header-title">
          {#if isSubpage}<Button
              type="button"
              variant="ghost"
              size="icon"
              class="icon-button"
              aria-label={t("Back")}
              onclick={back}><ArrowLeft size={21} /></Button
            >{/if}
          {#if properties.length}
            <div class="header-structure">
              <Building2 size={18} aria-hidden="true" />
              <NativeSelect.Root
                class="w-full"
                aria-label={t("Structure")}
                value={editing ? draft.propertyId : propertyId}
                disabled={editing || doorEditor || propertyForm}
                onchange={(event) => {
                  propertyId = event.currentTarget.value;
                  changeTourProperty(propertyId);
                }}
              >
                {#each properties as p (p.id)}<NativeSelect.Option value={p.id}
                    >{p.name}</NativeSelect.Option
                  >{/each}
              </NativeSelect.Root>
            </div>
          {:else}<span class="font-semibold">oshost</span>{/if}
        </div>
        <div class="row header-actions">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="icon-button"
            aria-label={t("Notifications")}
            title={t("Notification history")}
            onclick={() => navigate("Activity")}><Bell size={20} /></Button
          ><Button
            type="button"
            variant="ghost"
            size="icon"
            class="icon-button"
            aria-label={t("Profile")}
            onclick={() => navigate("Profile")}><UserRound size={21} /></Button
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
        {#if item.name === "Create"}<Button
            type="button"
            variant="ghost"
            class="quick-create"
            data-tour="new-code"
            aria-label={t("Create access code")}
            disabled={!propertyId || busy}
            onclick={() => {
              if (tourVisible && tourStage === "door") {
                editingDoor = "";
                detailDoorId = "";
                doorEditor = true;
              } else if (tourVisible) newCode();
              else quickCreate = true;
            }}><Plus size={25} /></Button
          >
        {:else}<Button
            type="button"
            variant="outline"
            class={cn({
              active:
                tab === item.name ||
                (item.name === "Settings" &&
                  ["Connectors", "Messages", "Profile"].includes(tab)),
            })}
            aria-current={tab === item.name ? "page" : undefined}
            data-tour={"nav-" + item.name.toLowerCase()}
            onclick={() => navigate(item.name)}
            ><item.icon size={21} /><span>{t(item.label ?? item.name)}</span
            ></Button
          >{/if}
      {/each}
    </nav>
    <main class:settings-index={tab === "Settings" && !settingsPage}>
      <div class="page-heading"><h1>{t(pageTitle)}</h1></div>
      <Tour
        open={tourVisible}
        stage={tourStage}
        title={t(tourTitle)}
        text={tourText}
        target={tourTarget}
        onfinish={(result) => void endTour(result)}
      />
      {#if tourVisible && (tourStage === "install" || tourStage === "notifications")}
        {#key tourStage}<OnboardingDeviceSetup
            stage={tourStage}
            oncontinue={continueDeviceSetup}
            onenablepush={enablePush}
          />{/key}
      {/if}

      {#if error}<div class="error row spread" role="alert">
          <span>{t(error)}</span><Button
            type="button"
            variant="ghost"
            size="icon"
            class="icon-button"
            aria-label={t("Dismiss")}
            onclick={() => (error = "")}><X size={17} /></Button
          >
        </div>{/if}{#if notice}<div class="toast" role="status">
          <Check size={17} /><span>{t(notice)}</span><Button
            type="button"
            variant="ghost"
            size="icon"
            class="icon-button"
            aria-label={t("Dismiss")}
            onclick={() => (notice = "")}><X size={16} /></Button
          >
        </div>{/if}
      {#key tab + ":" + settingsPage}
        <div
          class="view-content"
          in:fly={{
            y: reducedMotion.current ? 0 : 8,
            duration: reducedMotion.current ? 0 : 180,
            easing: cubicOut,
          }}
        >
          {#if tab === "Codes"}
            {#if editing}<form
                data-tour="code-form"
                class="stack"
                onsubmit={(e) => {
                  e.preventDefault();
                  void act(save);
                }}
              >
                <Card.Root class="workspace-card stack">
                  <div class="row spread">
                    <h2>
                      {t(editId ? "Edit access code" : "Create access code")}
                    </h2>
                    <Button
                      variant="outline"
                      type="button"
                      onclick={() => {
                        editing = false;
                        localStorage.removeItem("oshost.draft." + user.id);
                      }}>{t("Discard")}</Button
                    >
                  </div>
                  <div class="form-grid">
                    <Label class="field-label"
                      >{t("Guest name / label")}<Input
                        bind:value={draft.label}
                        required
                        placeholder={t("e.g. Maria Rossi")}
                      /></Label
                    ><Label class="field-label"
                      >{t("Property")}<NativeSelect.Root
                        aria-label={t("Property")}
                        class="w-full"
                        value={draft.propertyId}
                        onchange={(event) => {
                          const previous = properties.find(
                              (p) => p.id === draft.propertyId,
                            ),
                            next = properties.find(
                              (p) => p.id === event.currentTarget.value,
                            );
                          if (
                            !draft.checkinLink ||
                            draft.checkinLink === previous?.defaultCheckinLink
                          )
                            draft.checkinLink = next?.defaultCheckinLink ?? "";
                          if (
                            !draft.instructionsLink ||
                            draft.instructionsLink ===
                              previous?.defaultInstructionsLink
                          )
                            draft.instructionsLink =
                              next?.defaultInstructionsLink ?? "";
                          draft.propertyId = event.currentTarget.value;
                          draft.grants = [];
                          if (tourVisible) changeTourProperty(draft.propertyId);
                        }}
                        >{#each properties as p, index (p.id ?? index)}<NativeSelect.Option
                            value={p.id}>{p.name}</NativeSelect.Option
                          >{/each}</NativeSelect.Root
                      ></Label
                    >
                  </div>
                  <Label class="field-label"
                    >{t("Internal notes")}<Textarea bind:value={draft.notes}
                    ></Textarea></Label
                  >
                  <div class="form-grid">
                    <Label class="field-label"
                      >{t("Online check-in link")}<Input
                        bind:value={draft.checkinLink}
                        type="url"
                      /></Label
                    ><Label class="field-label"
                      >{t("Instructions link")}<Input
                        bind:value={draft.instructionsLink}
                        type="url"
                      /></Label
                    >
                  </div>
                </Card.Root>
                <Card.Root class="workspace-card">
                  <h2>{t("Door permissions")}</h2>
                  <p class="muted">
                    {t("Times use")}
                    {properties.find((p) => p.id === draft.propertyId)
                      ?.timezone}{t(". Each door has its own rules.")}
                  </p>
                  {#each doors.filter((d) => d.propertyId === draft.propertyId) as d, index (d.id ?? index)}{@const grant =
                      draft.grants.find((g) => g.doorId === d.id)}
                    <div class="door">
                      <Label class="inline"
                        ><Switch
                          checked={!!grant}
                          onCheckedChange={(checked) => selectDoor(d, checked)}
                        />{d.name}{d.common
                          ? " · " + t("Common door")
                          : ""}</Label
                      >{#if grant}<div
                          class="form-grid"
                          style="margin-top:14px"
                        >
                          <Label class="field-label"
                            >{t("Valid from")}<Input
                              type="datetime-local"
                              value={dateInput(grant.start)}
                              onchange={(e) =>
                                changeDate(
                                  grant,
                                  "start",
                                  e.currentTarget.value,
                                )}
                              required
                            /></Label
                          ><Label class="field-label"
                            >{t("Valid until")}<Input
                              type="datetime-local"
                              value={dateInput(grant.end)}
                              onchange={(e) =>
                                changeDate(grant, "end", e.currentTarget.value)}
                              required
                            /></Label
                          ><Label class="inline"
                            ><Switch bind:checked={grant.singleUse} />{t(
                              "Single use",
                            )}</Label
                          >
                        </div>{/if}
                    </div>{/each}{#if !doors.length}<p>
                      {t(
                        "Add a property in Settings, then connect a door in Doors.",
                      )}
                    </p>{/if}
                </Card.Root>
                <Card.Root class="workspace-card stack">
                  <Label class="inline"
                    ><Switch
                      checked={!!draft.breakfast}
                      onCheckedChange={(checked) =>
                        (draft.breakfast = checked
                          ? breakfastDefaults(
                              draft,
                              properties.find((p) => p.id === draft.propertyId)
                                ?.timezone ?? "UTC",
                            )
                          : null)}
                    />{t("Include breakfast")}</Label
                  >{#if draft.breakfast}<div class="form-grid">
                      <Label class="field-label"
                        >{t("Total breakfasts")}<Input
                          type="number"
                          min="0"
                          bind:value={draft.breakfast.total}
                          required
                        /></Label
                      ><Label class="field-label"
                        >{t("First breakfast date")}<Input
                          type="date"
                          bind:value={draft.breakfast.start}
                          required
                        /></Label
                      ><Label class="field-label"
                        >{t("Last breakfast date")}<Input
                          type="date"
                          bind:value={draft.breakfast.end}
                          required
                        /></Label
                      >
                    </div>{/if}
                </Card.Root>
                {#if duplicateCodes.length}<p class="notice" role="status">
                    {t(
                      "An identical access code already exists. Saving requires confirmation.",
                    )}
                  </p>{/if}
                <Button
                  type="submit"
                  variant="default"
                  class="primary"
                  disabled={busy || !draft.propertyId}
                  >{t("Save access code")}</Button
                ><small
                  >{t(
                    "Active permissions are published after the server confirms this save.",
                  )}</small
                >
              </form>
            {:else if detailCode}
              <section class="code-detail stack" data-code-id={detailCode.id}>
                <div class="row spread">
                  <Badge variant="secondary" class="badge"
                    >{t(statusOf(detailCode))}</Badge
                  >
                </div>
                {#if detailCode.notes}<p>{detailCode.notes}</p>{/if}
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
                  <Button
                    type="button"
                    variant="default"
                    class="primary"
                    disabled={!!detailCode.revoked}
                    onclick={() => act(() => prepareShare(detailCode))}
                    ><Share2 size={17} />{t("Prepare message")}</Button
                  ><Button
                    type="button"
                    variant="outline"
                    onclick={() => edit(detailCode)}
                    ><Pencil size={17} />{t("Edit")}</Button
                  ><a
                    class="button"
                    href={detailCode.link}
                    target="_blank"
                    rel="noreferrer"
                    ><ExternalLink size={17} />{t("Visit guest page")}</a
                  >
                </div>
                <section class="copy-fields">
                  <Label class="field-label"
                    >{t("Access code")}
                    <div class="input-action">
                      <Input
                        readonly
                        value={guestToken(detailCode.link)}
                        aria-label={t("Access code value")}
                      /><Button
                        type="button"
                        variant="outline"
                        disabled={!!detailCode.revoked}
                        onclick={() => void copy(guestToken(detailCode.link))}
                        ><Copy size={16} />{t("Copy code")}</Button
                      >
                    </div></Label
                  ><Label class="field-label"
                    >{t("Guest link")}
                    <div class="input-action">
                      <Input
                        readonly
                        value={detailCode.link}
                        aria-label={t("Guest link value")}
                      /><Button
                        type="button"
                        variant="outline"
                        disabled={!!detailCode.revoked}
                        onclick={() => void copy(detailCode.link)}
                        ><Link size={16} />{t("Copy link")}</Button
                      >
                    </div></Label
                  >
                </section>
                <h3>{t("Door permissions")}</h3>
                {#each detailCode.grants as g (g.doorId)}<section
                    class="permission-row stack"
                  >
                    <div class="row spread">
                      <strong
                        >{doors.find((d) => d.id === g.doorId)?.name}</strong
                      ><Badge variant="secondary" class="badge"
                        >{t(grantStatus(g))}</Badge
                      >
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
                    <Button
                      type="button"
                      variant="outline"
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
                      )}</Button
                    >
                    {#if g.claim}<div class="error">
                        <p>
                          {t("Uncertain device request:")}
                          {t("Check the door before allowing another request.")}
                        </p>
                        <div class="row">
                          <Button
                            type="button"
                            variant="outline"
                            onclick={() =>
                              act(async () => {
                                await api(`codes/${detailCode.id}/resolve`, {
                                  doorId: g.doorId,
                                  consumed: true,
                                });
                                await reload();
                              })}>{t("Mark consumed")}</Button
                          ><Button
                            type="button"
                            variant="outline"
                            onclick={() =>
                              act(async () => {
                                await api(`codes/${detailCode.id}/resolve`, {
                                  doorId: g.doorId,
                                  consumed: false,
                                });
                                await reload();
                              })}>{t("Permit retry")}</Button
                          >
                        </div>
                      </div>{/if}
                  </section>{/each}
                {#if detailCode.breakfast}<section>
                    <h3>{t("Breakfast")}</h3>
                    <p>
                      {detailCode.breakfastUsed} / {detailCode.breakfast.total} ·
                      {detailCode.breakfast.start} → {detailCode.breakfast.end}
                    </p>
                  </section>{/if}
                <details class="manage-access">
                  <summary>{t("Manage access")}</summary>
                  <p class="muted">
                    {t(
                      "Replacing or revoking a link takes effect immediately.",
                    )}
                  </p>
                  <div class="row">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!!detailCode.revoked || busy}
                      onclick={() => act(() => replaceLink(detailCode))}
                      >{t("Replace link")}</Button
                    ><Button
                      type="button"
                      variant="destructive"
                      class="danger"
                      disabled={!!detailCode.revoked || busy}
                      onclick={() => act(() => revoke(detailCode))}
                      >{t("Revoke")}</Button
                    >
                  </div>
                </details>
              </section>
            {:else}
              <div class="calendar-bar code-toolbar">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("Previous day")}
                  onclick={() => shiftDay(-1)}><ChevronLeft size={18} /></Button
                >
                <AccessCalendar
                  value={activeCodeDate}
                  hasCodes={dateHasCodes}
                  onchange={(day) => (codeDate = day)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("Next day")}
                  onclick={() => shiftDay(1)}><ChevronRight size={18} /></Button
                >
                <Button
                  variant="ghost"
                  class="quiet today-button"
                  onclick={() =>
                    (codeDate = dayAt(new Date().toISOString(), propertyId))}
                  >{t("Today")}</Button
                >
                <div class="toolbar-spacer"></div>
                <Popover.Root>
                  <Popover.Trigger
                    class={buttonVariants({ variant: "ghost", size: "icon" })}
                    aria-label={t("Search codes")}
                    title={t("Search codes")}
                    data-search-active={!!search}
                    ><Search size={18} /></Popover.Trigger
                  >
                  <Popover.Content align="end" class="w-72">
                    <Label for="code-search">{t("Search codes")}</Label>
                    <div class="flex gap-2">
                      <Input
                        id="code-search"
                        placeholder={t("Search guest access…")}
                        bind:value={search}
                      /><Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("Clear search")}
                        onclick={() => (search = "")}><X size={16} /></Button
                      >
                    </div>
                  </Popover.Content>
                </Popover.Root>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("Filters")}
                  title={t("Filters")}
                  aria-expanded={filtersOpen}
                  onclick={() => (filtersOpen = !filtersOpen)}
                  ><ListFilter size={17} />{codeStatus !== "all"
                    ? "1"
                    : ""}</Button
                >
              </div>
              {#if filtersOpen}<div class="filter-panel">
                  <Label class="field-label"
                    >{t("Status")}<NativeSelect.Root
                      class="w-full"
                      aria-label={t("Status")}
                      bind:value={codeStatus}
                      ><NativeSelect.Option value="all"
                        >{t("All codes")}</NativeSelect.Option
                      >{#each ["Valid now", "Upcoming", "Expired", "Revoked", "No available doors"] as state (state)}<NativeSelect.Option
                          value={state}>{t(state)}</NativeSelect.Option
                        >{/each}</NativeSelect.Root
                    ></Label
                  ><Button
                    type="button"
                    variant="ghost"
                    class="quiet"
                    onclick={() => {
                      codeDate = "";
                      codeStatus = "all";
                      search = "";
                    }}>{t("Clear filters")}</Button
                  >
                </div>{/if}
              <Item.Group class="code-list workspace-list">
                {#each filtered as c (c.id)}<article
                    animate:flip={{ duration: reducedMotion.current ? 0 : 220 }}
                    transition:fly={{
                      y: 8,
                      duration: reducedMotion.current ? 0 : 180,
                      easing: cubicOut,
                    }}
                    class="code-row"
                    data-code-id={c.id}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      class="code-summary"
                      onclick={() => (detailCodeId = c.id)}
                      ><span class="row"
                        ><strong>{c.label}</strong>{#if c.revoked}<Badge
                            variant="secondary"
                            class="badge">{t("Revoked")}</Badge
                          >{:else if c.grants.some((g: any) => g.claim)}<Badge
                            variant="secondary"
                            class="badge attention">{t("Needs review")}</Badge
                          >{/if}</span
                      ><span class="muted validity">{codeRange(c)}</span><span
                        class="row badges"
                        >{#each c.grants.slice(0, 3) as g (g.doorId)}<Badge
                            variant="secondary"
                            class="badge"
                            >{doors.find((d) => d.id === g.doorId)?.name}</Badge
                          >{/each}{#if c.grants.length > 3}<Badge
                            variant="secondary"
                            class="badge">+{c.grants.length - 3}</Badge
                          >{/if}{#if c.breakfast}<span class="muted"
                            ><Coffee size={13} />
                            {c.breakfast.total - c.breakfastUsed}</span
                          >{/if}<span
                          class="muted"
                          title={t("Successful requests")}
                          aria-label={t("Successful requests") +
                            ": " +
                            (reports.find((r) => r.id === c.id)?.accepted ?? 0)}
                          ><ChartNoAxesColumn size={13} />{reports.find(
                            (r) => r.id === c.id,
                          )?.accepted ?? 0}</span
                        ></span
                      ></Button
                    >
                    <div class="row row-actions">
                      <a
                        class={buttonVariants({
                          variant: "ghost",
                          size: "icon",
                        })}
                        href={c.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t("Open link")}
                        title={t("Open link")}><ExternalLink size={19} /></a
                      >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        class="icon-button"
                        aria-label={t("Copy link")}
                        title={t("Copy link")}
                        disabled={!!c.revoked}
                        onclick={() => void copy(c.link)}
                        ><Link size={19} /></Button
                      ><Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        class="icon-button"
                        aria-label={t("Prepare message")}
                        title={t("Prepare message")}
                        disabled={!!c.revoked}
                        onclick={() => act(() => prepareShare(c))}
                        ><Share2 size={19} /></Button
                      >
                    </div>
                  </article>{:else}<div class="empty-state">
                    <KeyRound size={36} />
                    <h2>
                      {t(
                        search || codeStatus !== "all"
                          ? "No matching codes"
                          : propertyId
                            ? "No codes for this date"
                            : "Your next guest starts here",
                      )}
                    </h2>
                    <p>
                      {t(
                        propertyId
                          ? "Choose another date or use + below to create an access code."
                          : "Create a link with just the doors and breakfast allowance they need.",
                      )}
                    </p>
                    {#if !propertyId}{#if user.role === "owner"}<Button
                          type="button"
                          variant="outline"
                          onclick={() => openSettings("properties")}
                          >{t("Set up a property")}</Button
                        >{:else}<p>
                          {t(
                            "Ask an owner to set up a property and its doors.",
                          )}
                        </p>{/if}{:else if search || codeStatus !== "all"}<Button
                        type="button"
                        variant="outline"
                        onclick={() => {
                          search = "";
                          codeDate = "";
                          codeStatus = "all";
                        }}>{t("Clear filters")}</Button
                      >{/if}
                  </div>{/each}
              </Item.Group>{/if}
          {:else if tab === "Activity"}<NotificationHistory
              refreshToken={liveRevision}
              {propertyId}
              propertyName={property?.name ?? ""}
              retentionMonths={property?.notificationRetentionMonths ?? 3}
              timezone={property?.timezone ?? "UTC"}
              {codes}
              {api}
            />
          {:else if tab === "Reports"}<Card.Root class="workspace-card">
              <h2>{t("Code creation and usage")}</h2>
              <p class="muted">
                {t(
                  "Grouped by creation month in the property timezone. Attempts and accepted requests are lifetime totals for those codes.",
                )}
              </p>
              <Table.Root>
                <Table.Header
                  ><Table.Row
                    ><Table.Head>{t("Host / month")}</Table.Head><Table.Head
                      >{t("Created")}</Table.Head
                    ><Table.Head>{t("Used")}</Table.Head><Table.Head
                      >{t("Attempts")}</Table.Head
                    ><Table.Head>{t("Accepted")}</Table.Head></Table.Row
                  ></Table.Header
                ><Table.Body
                  >{#each stats as s, index (s.name + s.month)}<Table.Row
                      ><Table.Cell
                        >{s.name}<br /><small>{s.month}</small></Table.Cell
                      ><Table.Cell>{s.created}</Table.Cell><Table.Cell
                        >{s.used}</Table.Cell
                      ><Table.Cell>{s.attempts}</Table.Cell><Table.Cell
                        >{s.accepted}</Table.Cell
                      ></Table.Row
                    >{/each}</Table.Body
                >
              </Table.Root>
            </Card.Root>
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
            <div class="form-grid form-controls">
              <Label class="field-label"
                >{t("Language")}<NativeSelect.Root
                  class="w-full"
                  aria-label={t("Template language")}
                  bind:value={templateLang}
                  ><NativeSelect.Option value="en">English</NativeSelect.Option
                  ><NativeSelect.Option value="it">Italiano</NativeSelect.Option
                  ></NativeSelect.Root
                ></Label
              ><Label class="field-label"
                >{t("Message")}<NativeSelect.Root
                  class="w-full"
                  aria-label={t("Template type")}
                  bind:value={templateKind}
                  ><NativeSelect.Option value="access"
                    >{t("Access link")}</NativeSelect.Option
                  ><NativeSelect.Option value="checkin"
                    >{t("Check-in")}</NativeSelect.Option
                  ><NativeSelect.Option value="instructions"
                    >{t("Instructions")}</NativeSelect.Option
                  ></NativeSelect.Root
                ></Label
              >
            </div>
            <Card.Root class="workspace-card stack">
              <h2>{t("Property templates")}</h2>
              <small
                >{t("Placeholders:")}
                {"{{guest}}, {{link}}, {{checkinLink}}, {{instructionsLink}}, {{host}}"}</small
              ><Textarea
                disabled={busy || templatesLoading}
                bind:ref={templateInput}
                aria-label={t("Message template")}
                bind:value={templates[templateLang][templateKind]}
              ></Textarea>
              <div class="row">
                {#each ["guest", "link", "checkinLink", "instructionsLink", "host"] as key (key)}<Button
                    type="button"
                    variant="outline"
                    disabled={busy || templatesLoading}
                    onclick={() => insertPlaceholder(key)}
                    >{"{{" + key + "}}"}</Button
                  >{/each}
              </div>
              <Button
                type="button"
                variant="outline"
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
                }}>{t("Reset to default")}</Button
              >
              <h3>{t("Live sample preview")}</h3>
              <pre class="message-preview">{preview(
                  templates[templateLang]?.[templateKind] ?? "",
                  codes.find((c) => c.id === messageCode),
                )}</pre>
              <Button
                type="button"
                variant="outline"
                disabled={busy || templatesLoading || !propertyId}
                onclick={() =>
                  act(async () => {
                    await api("templates/" + propertyId, templates, "PUT");
                    notice = "Templates saved.";
                  })}>{t("Save templates")}</Button
              >
            </Card.Root>
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
          {:else if tab === "Profile"}<Card.Root class="workspace-card stack">
              <h2>{t("Your account")}</h2>
              <Label class="field-label"
                >{t("Your name")}<Input readonly value={user.name} /></Label
              ><Label class="field-label"
                >{t("Email")}<Input readonly value={user.email ?? ""} /></Label
              >
              <p>{t("Role")}: {t(user.role)}</p>
              <small>{t("Account ID")}: {user.id}</small><Button
                type="button"
                variant="outline"
                disabled={busy}
                onclick={() => act(logout)}
                ><LogOut size={17} />{t("Sign out")}</Button
              >
            </Card.Root>
          {:else if tab === "Settings"}
            {#if !settingsPage}<div class="page-intro">
                <p>{t("Manage your workspace and preferences")}</p>
              </div>
              {#each ["Preferences", "Workspace", "Administration"] as group (group)}{@const items =
                  settingItems.filter(
                    (i) =>
                      i.group === group && (!i.owner || user.role === "owner"),
                  )}{#if items.length}<section class="settings-group">
                    <h2>{t(group)}</h2>
                    <Item.Group class="workspace-list">
                      {#each items as item (item.id)}
                        <Item.Root class="p-0 rounded-none">
                          {#snippet child({ props })}
                            <Button
                              {...props}
                              variant="ghost"
                              class="settings-row"
                              data-tour={"nav-" + item.id}
                              onclick={() => openSettings(item.id)}
                            >
                              <Item.Media variant="icon"
                                ><item.icon size={20} /></Item.Media
                              >
                              <Item.Content
                                ><Item.Title>{t(item.title)}</Item.Title
                                ><Item.Description
                                  >{t(item.description)}</Item.Description
                                ></Item.Content
                              >
                              <Item.Actions
                                ><ChevronRight size={18} /></Item.Actions
                              >
                            </Button>
                          {/snippet}
                        </Item.Root>
                      {/each}
                    </Item.Group>
                  </section>{/if}{/each}
              <Item.Group class="workspace-list">
                <Button
                  type="button"
                  variant="ghost"
                  class="settings-row"
                  data-tour="app-tour"
                  onclick={startTour}
                  ><CircleHelp size={21} /><span
                    ><strong>{t("App tour")}</strong><small
                      >{t("A quick guide to your host workspace")}</small
                    ></span
                  ><ChevronRight size={18} /></Button
                >
              </Item.Group>
            {:else if settingsPage === "appearance"}<div class="page-intro">
                <p>{t("Light, dark or follow your device")}</p>
              </div>
              <div
                class="theme-options"
                role="radiogroup"
                aria-label={t("Theme")}
              >
                {#each [{ id: "light", title: "Light", icon: Sun }, { id: "dark", title: "Dark", icon: Moon }, { id: "system", title: "System", icon: Monitor }] as option (option.id)}<Button
                    type="button"
                    variant="outline"
                    class={cn({ selected: theme === option.id })}
                    role="radio"
                    aria-checked={theme === option.id}
                    disabled={busy}
                    onclick={() => act(() => preferences({ theme: option.id }))}
                    ><span class={"theme-preview " + option.id}
                      ><span></span><span></span><span></span></span
                    ><span class="row"
                      ><option.icon size={17} />{t(
                        option.title,
                      )}{#if theme === option.id}<Check size={16} />{/if}</span
                    ></Button
                  >{/each}
              </div>
            {:else if settingsPage === "language"}<div class="page-intro">
                <p>
                  {t(
                    "Your choice is saved to your account across devices. Guest language is independent.",
                  )}
                </p>
              </div>
              <Item.Group
                class="workspace-list"
                role="radiogroup"
                aria-label={t("App language")}
              >
                {#each [{ id: "it", name: "Italiano", detail: "Italian" }, { id: "en", name: "English", detail: "English" }] as language (language.id)}<Button
                    type="button"
                    variant="ghost"
                    class="settings-row"
                    role="radio"
                    aria-checked={hostLanguage.current === language.id}
                    disabled={busy}
                    onclick={() =>
                      act(() => chooseLanguage(language.id as HostLocale))}
                    ><span class="language-badge"
                      >{language.id.toUpperCase()}</span
                    ><span
                      ><strong>{language.name}</strong><small
                        >{t(language.detail)}</small
                      ></span
                    >{#if hostLanguage.current === language.id}<Check
                        size={19}
                      />{/if}</Button
                  >{/each}
              </Item.Group>
            {:else if settingsPage === "notifications"}
              <StructureSettings
                {property}
                mode="notifications"
                owner={user.role === "owner"}
                {api}
                {reload}
              />
              <Card.Root class="workspace-card stack">
                <h2>
                  {hostLanguage.current === "it"
                    ? "Notifiche su questo dispositivo"
                    : "Notifications on this device"}
                </h2>
                <p class="muted">
                  {hostLanguage.current === "it"
                    ? "Le preferenze qui sotto controllano gli avvisi nell’app. Abilita le notifiche push per riceverli anche quando l’app è chiusa."
                    : "The preferences below control in-app alerts. Enable push to receive them when the app is closed too."}
                </p>
                <p class="muted">
                  {t(
                    "Install this app from your browser menu. On iPhone: Share → Add to Home Screen, then enable notifications here.",
                  )}
                </p>
                <small
                  >{t("Permission:")}
                  {t(
                    (
                      {
                        granted: "Allowed",
                        denied: "Blocked",
                        default: "Not requested",
                        unsupported: "Not supported",
                      } as Record<string, string>
                    )[permission] ?? permission,
                  )}{t(
                    ". Choose event types below. No selection means no push notifications.",
                  )}</small
                >
                <div class="row">
                  <Label class="inline"
                    ><Switch
                      checked={pushAllProperties}
                      onCheckedChange={(checked) => {
                        pushAllProperties = !!checked;
                        pushProperties = [];
                      }}
                    />{t("All structures")}</Label
                  >
                  {#each properties as p, index (p.id ?? index)}<Label
                      class="inline"
                      ><Switch
                        checked={pushAllProperties ||
                          pushProperties.includes(p.id)}
                        onCheckedChange={(checked) => {
                          const ids = (
                            pushAllProperties
                              ? properties.map((p) => p.id)
                              : pushProperties
                          ).filter((id) => id !== p.id);
                          if (checked) ids.push(p.id);
                          pushAllProperties = false;
                          pushProperties = ids;
                        }}
                      />{p.name}</Label
                    >{/each}
                </div>
                <fieldset class="stack">
                  <legend>{t("Notify me about")}</legend>
                  <Label class="inline"
                    ><Switch
                      checked={pushAllEvents}
                      onCheckedChange={(checked) => {
                        pushAllEvents = !!checked;
                        pushEvents = "";
                      }}
                    />{t("All activity types")}</Label
                  >
                  {#each [["code.created", "Access code created"], ["access.accepted", "Access accepted"], ["access.denied", "Access denied"], ["access.failed", "Device failures"], ["access.uncertain", "Uncertain requests"], ["access.invalid", "Invalid access code attempts (including page loads)"], ["breakfast.redeemed", "Breakfast usage"], ["breakfast.denied", "Rejected breakfasts"]] as option (option[0])}<Label
                      class="inline"
                      ><Switch
                        checked={pushAllEvents ||
                          pushEvents.split(",").includes(option[0])}
                        onCheckedChange={(checked) => {
                          const values = (
                            pushAllEvents
                              ? notificationTypes
                              : pushEvents.split(",").filter(Boolean)
                          ).filter((v) => v !== option[0]);
                          pushAllEvents = false;
                          if (checked) values.push(option[0]);
                          pushEvents = values.join(",");
                        }}
                      />{t(option[1])}</Label
                    >{/each}
                </fieldset>
                <div class="row">
                  <Button
                    type="button"
                    variant="outline"
                    onclick={() => {
                      localStorage.setItem(
                        "oshost.push." + user.id,
                        JSON.stringify({
                          properties: pushProperties,
                          events: pushEvents.split(",").filter(Boolean),
                          allEvents: pushAllEvents,
                          allProperties: pushAllProperties,
                        }),
                      );
                      notice =
                        hostLanguage.current === "it"
                          ? "Preferenze nell’app salvate."
                          : "In-app preferences saved.";
                    }}
                    >{hostLanguage.current === "it"
                      ? "Salva preferenze nell’app"
                      : "Save in-app preferences"}</Button
                  >
                  <Button
                    type="button"
                    variant="outline"
                    onclick={() => act(enablePush)}
                    >{t("Enable / update notifications")}</Button
                  ><Button
                    type="button"
                    variant="outline"
                    onclick={() =>
                      act(async () => {
                        if ("serviceWorker" in navigator) {
                          const r =
                            await navigator.serviceWorker.getRegistration(
                              "/host/",
                            );
                          const subscription =
                            await r?.pushManager.getSubscription();
                          if (subscription) {
                            await api(
                              "push/subscriptions",
                              { endpoint: subscription.endpoint },
                              "DELETE",
                            );
                            await subscription.unsubscribe();
                          }
                        }
                        notice = "Notifications disabled.";
                      })}>{t("Disable notifications")}</Button
                  >
                </div>
              </Card.Root>
            {:else if settingsPage === "install"}<InstallAppInfo />
            {:else if settingsPage === "guest-links"}<GuestLinksSettings
                {property}
                owner={user.role === "owner"}
                {api}
                {reload}
              />
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
                  <div class="form-grid">
                    <Label class="field-label"
                      >{t("Name")}<Input bind:value={pName} required /></Label
                    ><Label class="field-label"
                      >{t("Timezone")}<Input
                        bind:value={pZone}
                        required
                        placeholder={t("Europe/Rome")}
                      /></Label
                    ><Label class="field-label"
                      >{t("Default arrival time")}<Input
                        type="time"
                        bind:value={pIn}
                        required
                      /></Label
                    ><Label class="field-label"
                      >{t("Default departure time")}<Input
                        type="time"
                        bind:value={pOut}
                        required
                      /></Label
                    >
                  </div>
                  <Button type="submit" variant="outline"
                    >{t(pEditing ? "Save property" : "Add property")}</Button
                  >
                </form>
              {:else}<div class="section-intro row spread">
                  <p class="muted">
                    {t("Names, timezones and arrival defaults")}
                  </p>
                  {#if user.role === "owner"}<Button
                      type="button"
                      variant="default"
                      class="primary"
                      data-tour="add-property"
                      onclick={() => editProperty()}
                      ><Plus size={17} />{t("Add property")}</Button
                    >{/if}
                </div>
                <Item.Group class="workspace-list">
                  {#each properties as p (p.id)}<Button
                      type="button"
                      variant="ghost"
                      class="settings-row"
                      disabled={user.role !== "owner"}
                      onclick={() => editProperty(p)}
                      ><Building2 size={21} /><span
                        ><strong>{p.name}</strong><small
                          >{p.timezone} · {p.checkIn} / {p.checkOut}</small
                        ></span
                      >{#if user.role === "owner"}<ChevronRight
                          size={18}
                        />{/if}</Button
                    >{:else}<div class="empty-state">
                      <Building2 size={32} />
                      <h2>{t("Add your property first")}</h2>
                      <p>{t("Then connect the doors guests will access.")}</p>
                    </div>{/each}
                </Item.Group>{/if}
            {:else if settingsPage === "team" && user.role === "owner"}
              <Card.Root class="workspace-card stack">
                <h2>{t("Team")}</h2>
                <Button
                  type="button"
                  variant="outline"
                  onclick={() =>
                    act(async () => {
                      invitationLink = (await api("invites", {})).link;
                    })}>{t("Create invitation")}</Button
                >{#if invitationLink}<div class="input-action">
                    <Input
                      readonly
                      aria-label={t("Invitation link")}
                      value={invitationLink}
                    /><Button
                      type="button"
                      variant="outline"
                      onclick={() => void copy(invitationLink)}
                      ><Copy size={16} />{t("Copy invitation")}</Button
                    >
                  </div>{/if}<small
                  >{t(
                    "Invitations expire after 24 hours and can be used once.",
                  )}</small
                >{#each users as u, index (u.id ?? index)}<div
                    class="row spread"
                  >
                    <span>{u.name} · {t(u.role)}</span
                    >{#if u.role === "staff"}<Button
                        type="button"
                        variant="outline"
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
                          })}>{t("Remove")}</Button
                      >{/if}
                  </div>{/each}
              </Card.Root>
            {:else if settingsPage === "breakfast"}<StructureSettings
                {property}
                mode="breakfast"
                owner={user.role === "owner"}
                {api}
                {reload}
              />
            {:else if settingsPage === "data" && user.role === "owner"}<JsonBackup
                {api}
                {reload}
              />
              <Card.Root class="workspace-card stack danger-zone">
                <h2>{t("Danger zone")}</h2>
                <p>
                  {t(
                    "Wipe the entire workspace database, including all users, properties, doors, photos, access codes, breakfast history, credentials, templates, activity and notification subscriptions. All guest links and sessions stop working. This cannot be undone without a backup.",
                  )}
                </p>
                <p class="muted">
                  {t("Server logs are retained after a database wipe.")}
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  class="danger"
                  onclick={() => {
                    wipeOpen = true;
                    wipePassword = "";
                    wipeConfirmation = "";
                    wipeAcknowledged = false;
                  }}>{t("Wipe database…")}</Button
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
                    <Label class="inline"
                      ><Switch bind:checked={wipeAcknowledged} required />{t(
                        "I have a backup or accept permanent data loss, and I have the setup token.",
                      )}</Label
                    >
                    <Label class="field-label"
                      >{t("Current password")}<Input
                        type="password"
                        autocomplete="current-password"
                        bind:value={wipePassword}
                        required
                      /></Label
                    >
                    <Label class="field-label"
                      >{t("Type WIPE ALL DATA to confirm")}<Input
                        bind:value={wipeConfirmation}
                        autocomplete="off"
                        required
                        pattern="WIPE ALL DATA"
                      /></Label
                    >
                    <div class="row">
                      <Button
                        variant="outline"
                        type="button"
                        onclick={() => {
                          wipeOpen = false;
                          wipePassword = "";
                        }}>{t("Cancel")}</Button
                      ><Button
                        type="submit"
                        variant="destructive"
                        class="danger"
                        disabled={busy ||
                          !wipeAcknowledged ||
                          !wipePassword ||
                          wipeConfirmation !== "WIPE ALL DATA"}
                        >{t("Permanently wipe database")}</Button
                      >
                    </div>
                  </form>{/if}
              </Card.Root>
            {:else}<p class="muted">
                {t("Choose a section from Settings.")}
              </p>{/if}
          {/if}
        </div>
      {/key}
      <Modal
        open={!!shareCodeId}
        title={t("Prepare message")}
        onclose={() => (shareCodeId = "")}
        ><div class="stack">
          <p class="muted">{codes.find((c) => c.id === shareCodeId)?.label}</p>
          <div class="row">
            <Label class="field-label"
              >{t("Language")}<NativeSelect.Root
                class="w-full"
                aria-label={t("Language")}
                disabled={busy}
                bind:value={shareLanguage}
                onchange={refreshShare}
                ><NativeSelect.Option value="en">English</NativeSelect.Option
                ><NativeSelect.Option value="it">Italiano</NativeSelect.Option
                ></NativeSelect.Root
              ></Label
            ><Label class="field-label"
              >{t("Message")}<NativeSelect.Root
                class="w-full"
                aria-label={t("Message")}
                disabled={busy}
                bind:value={shareKind}
                onchange={refreshShare}
                ><NativeSelect.Option value="access"
                  >{t("Access link")}</NativeSelect.Option
                ><NativeSelect.Option value="checkin"
                  >{t("Check-in")}</NativeSelect.Option
                ><NativeSelect.Option value="instructions"
                  >{t("Instructions")}</NativeSelect.Option
                ></NativeSelect.Root
              ></Label
            >
          </div>
          <Textarea
            disabled={busy}
            aria-label={t("Message preview")}
            bind:value={shareText}
          ></Textarea>{#if notice === "Copied to clipboard."}<p
              class="muted"
              role="status"
            >
              {t(notice)}
            </p>{/if}
          <div class="row">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !shareText}
              onclick={() => void copy(shareText)}>{t("Copy message")}</Button
            >{#if navigator.share}<Button
                type="button"
                variant="outline"
                disabled={busy || !shareText}
                onclick={() =>
                  act(async () => {
                    try {
                      await navigator.share({ text: shareText });
                    } catch (e) {
                      if ((e as Error).name !== "AbortError") throw e;
                    }
                  })}>{t("Share")}</Button
              >{/if}
          </div>
        </div></Modal
      >
      <Modal
        open={quickCreate}
        title={t("Create")}
        onclose={() => (quickCreate = false)}
        ><Item.Group class="quick-create-options">
          <Button
            type="button"
            variant="ghost"
            class="settings-row"
            onclick={() => newCode()}
            ><KeyRound size={22} /><span
              ><strong>{t("Create access code")}</strong><small
                >{t("Choose doors and share a guest link")}</small
              ></span
            ><ChevronRight size={18} /></Button
          >{#if user.role === "owner"}<Button
              type="button"
              variant="ghost"
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
              ><ChevronRight size={18} /></Button
            >{/if}
        </Item.Group></Modal
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
          <Textarea
            bind:ref={copyInput}
            readonly
            aria-label={t("Text to copy")}
            value={manualCopy}
            onfocus={(e) => e.currentTarget.select()}
          ></Textarea><Button
            type="button"
            variant="default"
            class="primary"
            onclick={() => {
              copyInput?.focus();
              copyInput?.select();
            }}>{t("Select text")}</Button
          >
        </div></Modal
      >
      {#if busy}<p class="muted" role="status">{t("Working…")}</p>{/if}
    </main>
  </div>{/if}
