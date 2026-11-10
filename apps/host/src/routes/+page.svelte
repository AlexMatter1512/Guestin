<script lang="ts">
  import DateInput from "$lib/components/DateInput.svelte";
  import { migrateBrowserPreferences } from "../../../../shared/browser-brand";
  import {
    dateSettings,
    formatDisplayDate,
    formatDisplayDateTime,
  } from "$lib/date-settings.svelte";
  import { dateFormats, type DateFormat } from "../../../../shared/date-format";
  import {
    notificationText,
    wantsNotification,
    notificationTypes,
  } from "../../../../shared/notifications";
  import "$lib/access-form.css";
  import { Toaster } from "$lib/components/ui/sonner";
  import FeedbackToast from "$lib/components/FeedbackToast.svelte";
  import { toast } from "svelte-sonner";
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
  import CodeRowActions from "$lib/components/CodeRowActions.svelte";
  import HeadingRecordActions from "$lib/components/HeadingRecordActions.svelte";
  import "$lib/code-list-layout.css";
  import ActivityToast from "$lib/components/ActivityToast.svelte";
  import CollaboratorManager from "$lib/components/CollaboratorManager.svelte";
  import {
    hasPermission,
    type Permission,
  } from "../../../../shared/permissions";
  const can = (key: Permission) => hasPermission(user, key);
  const canManageCode = (code: any) =>
    can(code.staff ? "createStaffCodes" : "createAccessCodes");
  import { copyText, guestToken } from "$lib/browser";
  import DoorManager from "$lib/components/DoorManager.svelte";
  import SmtpSettings from "$lib/components/SmtpSettings.svelte";
  import AccountRecovery from "$lib/components/AccountRecovery.svelte";
  import EmailVerification from "$lib/components/EmailVerification.svelte";
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
    codeInputSchema,
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
    currentPassword = $state(""),
    newPassword = $state(""),
    confirmPassword = $state(""),
    setupToken = $state(""),
    invite = $state("");
  let managedProperties = $state<any[]>([]);
  let notesEnabled = $state(false);
  let deleteTarget = $state<{
    kind: "properties" | "codes" | "users";
    id: string;
    name: string;
  } | null>(null);
  let deleteConfirmation = $state("");
  const requiredDeleteConfirmation = $derived(
    deleteTarget?.kind === "properties"
      ? "DELETE STRUCTURE"
      : deleteTarget?.kind === "users"
        ? "DELETE ACCOUNT"
        : "DELETE CODE",
  );
  function requestDelete(kind: "properties" | "codes" | "users", value: any) {
    toast.dismiss();
    deleteConfirmation = "";
    deleteTarget = { kind, id: value.id, name: value.name ?? value.label };
  }
  async function permanentlyDelete() {
    if (!deleteTarget || deleteConfirmation !== requiredDeleteConfirmation)
      return;
    const deletingUserId = user.id;
    const self =
      deleteTarget.kind === "users" && deleteTarget.id === deletingUserId;
    await api(
      `${deleteTarget.kind}/${deleteTarget.id}`,
      { confirmation: deleteConfirmation },
      "DELETE",
    );
    deleteTarget = null;
    if (self) {
      localStorage.removeItem("guestin.draft." + deletingUserId);
      localStorage.removeItem("guestin.draft.lastUser");
      resetAccountUI();
      user = null;
      csrf = "";
      history.replaceState(null, "", "/host/");
      return;
    }
    detailCodeId = "";
    await reload();
    toast.success(t("Permanently deleted"));
  }
  let properties = $state<any[]>([]),
    doors = $state<any[]>([]),
    codes = $state<any[]>([]),
    connections = $state<any[]>([]),
    reports = $state<any[]>([]),
    users = $state<any[]>([]),
    propertyId = $state(""),
    search = $state("");
  let staffCodes = $state(false);
  function setStaffCodes(value: boolean) {
    staffCodes = value;
    codeStatus = value ? "Non revoked" : "all";
    search = "";
    filtersOpen = false;
  }
  function setStaffCode(value: boolean) {
    if (!can(value ? "createStaffCodes" : "createAccessCodes")) return;
    draft.staff = value;
    if (!value) {
      const start = new Date().toISOString(),
        end = new Date(Date.now() + 86400000).toISOString();
      draft.grants = draft.grants.map((grant) => ({ ...grant, start, end }));
    }
  }
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
  const effectiveTheme = $derived(
    (theme === "system" ? systemDark : theme === "dark") ? "dark" : "light",
  );
  const browserThemeColor = $derived(
    effectiveTheme === "dark" ? "#0a0a0a" : "#ffffff",
  );
  let unread = $state({
    total: 0,
    global: 0,
    properties: {} as Record<string, number>,
  });
  async function refreshUnread() {
    const account = user?.id;
    if (!account) return;
    const counts = await api("events/unread");
    if (user?.id === account) unread = counts;
  }
  let copyInput = $state<HTMLTextAreaElement | null>(null);
  const settingItems = [
    {
      id: "install",
      title: "Install app",
      description: "Add guestin to your iPhone or Android Home Screen",
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
      id: "smtp",
      title: "Email delivery (SMTP)",
      description: "Verification and password recovery emails",
      icon: Plug,
      group: "Workspace",
      owner: true,
    },
    {
      id: "team",
      title: "Team",
      description: "Invite and manage collaborators",
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
  function signedOut() {
    localStorage.removeItem("guestin.draft." + user.id);
    localStorage.removeItem("guestin.draft.lastUser");
    resetAccountUI();
    user = null;
    csrf = "";
    history.replaceState(null, "", "/host/");
  }
  async function logout() {
    await api("logout", {});
    signedOut();
  }
  async function changePassword() {
    if (newPassword !== confirmPassword)
      throw Error(t("Passwords do not match"));
    try {
      await api("me/password", { currentPassword, newPassword });
      signedOut();
      notice = "Password changed. Sign in again on each device.";
    } finally {
      currentPassword = newPassword = confirmPassword = "";
    }
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
    if (c.staff) return t("No time limit");
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
      staff: !!c.staff,
      label: c.label?.trim(),
      notes: c.notes ?? "",
      checkinLink: c.checkinLink ?? "",
      instructionsLink: c.instructionsLink ?? "",
      breakfast: c.breakfast ?? null,
      grants: (c.grants ?? [])
        .map((g: any) => ({
          doorId: g.doorId,
          start: c.staff ? null : g.start,
          end: c.staff ? null : g.end,
          singleUse: !!g.singleUse,
          active: g.active !== false,
        }))
        .sort((a: any, b: any) => a.doorId.localeCompare(b.doorId)),
    });
  }
  function grantStatus(g: any, staff = false) {
    const d = doors.find((d) => d.id === g.doorId);
    if (g.active === false) return "Paused";
    if (d?.enabled === false) return "Door disabled";
    if (g.claim) return "Uncertain";
    if (g.singleUse && g.used) return "Used";
    if (!staff && Date.parse(g.start) > currentTime) return "Upcoming";
    if (!staff && Date.parse(g.end) <= currentTime) return "Expired";
    if (d?.integration === "none") return "Not connected yet";
    return "Valid now";
  }
  function statusOf(c: any) {
    if (c.revoked) return "Revoked";
    if (c.grants.some((g: any) => grantStatus(g, !!c.staff) === "Valid now"))
      return "Valid now";
    if (c.grants.some((g: any) => grantStatus(g, !!c.staff) === "Upcoming"))
      return "Upcoming";
    if (
      c.grants.length &&
      c.grants.every((g: any) => grantStatus(g, !!c.staff) === "Expired")
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
    return formatDisplayDateTime(
      iso,
      properties.find((p) => p.id === id)?.timezone ?? "UTC",
    );
  }
  function applyPreferences() {
    if (user.preferences?.language)
      setHostLocale(user.id, user.preferences.language);
    else restoreHostLocale(user.id);
    theme = user.preferences?.theme ?? "system";
    try {
      const saved = JSON.parse(
        localStorage.getItem("guestin.push." + user.id) ?? "null",
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
    const recovery = location.hash.match(
      /^#\/(reset-password|verify-email)\/([A-Za-z0-9_-]+)$/,
    );
    if (recovery) {
      recoveryMode = recovery[1];
      recoveryToken = recovery[2];
      return;
    }
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
    const savedDraft = user && localStorage.getItem("guestin.draft." + user.id);
    const savedEditId =
      user && localStorage.getItem("guestin.draft.editId." + user.id);
    const canRestore =
      savedDraft &&
      (id === "new" ? !savedEditId : action === "edit" && savedEditId === id);
    tab = found;
    if (found === "Codes" && id === "staff" && !staffCodes) setStaffCodes(true);
    if (found === "Codes" && !id && staffCodes) setStaffCodes(false);
    settingsPage = found === "Settings" ? (id ?? "") : "";
    propertyForm = found === "Settings" && id === "properties" && !!action;
    if (propertyForm) editProperty(properties.find((p) => p.id === action));
    connectorView =
      found === "Connectors" && ["kross", "ical", "gemini"].includes(id)
        ? (id as "kross" | "ical" | "gemini")
        : "list";
    editing = false;
    notesEnabled = false;
    doorEditor = false;
    detailCodeId = "";
    detailDoorId = "";
    quickCreate = false;
    if (found === "Codes" && id === "new") {
      if (canRestore) {
        draft = JSON.parse(savedDraft!);
        staffCodes = !!draft.staff;
        editId = "";
        editing = true;
        propertyId = draft.propertyId;
      } else newCode();
    } else if (found === "Codes" && id && id !== "staff") {
      const c = codes.find((c) => c.id === id);
      if (c) {
        setStaffCodes(!!c.staff);
        propertyId = c.propertyId;
        if (action === "edit") {
          if (canRestore) {
            draft = JSON.parse(savedDraft!);
            staffCodes = !!draft.staff;
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
      document.documentElement.dataset.theme = effectiveTheme;
      document.documentElement.style.backgroundColor = browserThemeColor;
      document.body.style.backgroundColor = browserThemeColor;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", browserThemeColor);
      document
        .querySelector('meta[name="color-scheme"]')
        ?.setAttribute("content", effectiveTheme);
      document
        .querySelector('link[rel="manifest"]')
        ?.setAttribute(
          "href",
          `/host/manifest.webmanifest?theme=${effectiveTheme}`,
        );
      try {
        localStorage.setItem("guestin.theme", theme);
      } catch {
        /* Storage is optional. */
      }
      document.documentElement.style.colorScheme =
        document.documentElement.dataset.theme;
      document.documentElement.classList.toggle(
        "dark",
        document.documentElement.dataset.theme === "dark",
      );
    }
  });
  $effect(() => {
    if (!routeReady || !user || recoveryMode) return;
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
          : staffCodes
            ? "/staff"
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
      if (key.startsWith("guestin.")) localStorage.removeItem(key);
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
    if (c.staff) return false;
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
        !!c.staff === staffCodes &&
        c.label.toLowerCase().includes(search.toLowerCase()) &&
        (codeStatus === "all" ||
          (codeStatus === "Non revoked"
            ? !c.revoked
            : statusOf(c) === codeStatus)) &&
        (staffCodes || codeOnDate(c, activeCodeDate)),
    ),
  );
  const hasCodeFilters = $derived(
    !!search || codeStatus !== (staffCodes ? "Non revoked" : "all"),
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
        name: r.name ?? "Former collaborator",
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
    dateSettings.format = (await api("settings")).dateFormat;
    [properties, doors, codes, connections, reports] = await Promise.all(
      ["properties", "doors", "codes", "connections", "reports"].map((p) =>
        p === "connections" && !can("useBookingConnectors")
          ? Promise.resolve([])
          : api(p),
      ),
    );
    if (!properties.some((p) => p.id === propertyId))
      propertyId = properties[0]?.id ?? "";
    if (!codes.some((c) => c.id === detailCodeId)) detailCodeId = "";
    if (!doors.some((d) => d.id === detailDoorId)) detailDoorId = "";
    managedProperties =
      user?.role === "owner" ? await api("properties?includeInactive=1") : [];
    await refreshUnread();
    if (user?.role === "owner") users = await api("users");
    else users = [];
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
          const [nextCodes, nextReports, nextUnread] = await Promise.all([
            api("codes"),
            api("reports"),
            api("events/unread"),
          ]);
          if (stopped || user?.id !== account) return;
          codes = nextCodes;
          reports = nextReports;
          unread = nextUnread;
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
      if (message.type === "account.changed" || message.type === "sync") {
        void api("me")
          .then(async (result) => {
            if (user?.id !== account) return;
            if (
              JSON.stringify([user.role, user.permissions]) !==
              JSON.stringify([result.user.role, result.user.permissions])
            )
              user = result.user;
            else if (user.emailVerified !== result.user.emailVerified)
              user = result.user;
            await reload();
            liveRevision++;
          })
          .catch((e) => {
            if (e.status === 401) {
              localStorage.removeItem("guestin.draft.lastUser");
              resetAccountUI();
              user = null;
              csrf = "";
              history.replaceState(null, "", "/host/");
            }
          });
        return;
      }
      if (message.type === "workspace.changed") {
        void reload()
          .then(() => liveRevision++)
          .catch(() => {});
        return;
      }
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
        const text = notificationText(
          event,
          hostLanguage.current,
          undefined,
          dateSettings.format,
        );
        toast.custom(ActivityToast, {
          id: event.id,
          componentProps: {
            event,
            title: text.title,
            body: text.body,
            activate: async (notification: any) => {
              await api("events/read", { eventIds: [notification.id] });
              await refreshUnread();
              if (notification.href)
                location.hash = new URL(
                  notification.href,
                  location.origin,
                ).hash;
            },
          },
        });
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
        localStorage.getItem("guestin.push." + account) ||
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
        localStorage.setItem("guestin.push." + account, JSON.stringify(saved));
      }
    } catch {
      /* Unsupported browsers keep local selection; history is always available. */
    }
  }
  onMount(() => {
    migrateBrowserPreferences(localStorage);
    migrateBrowserPreferences(sessionStorage);
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
        const saved = localStorage.getItem("guestin.draft." + user.id);
        if (saved) {
          draft = JSON.parse(saved);
          editId =
            localStorage.getItem("guestin.draft.editId." + user.id) ?? "";
          editing = true;
          notice = "Your unfinished draft has been restored.";
        }
      } catch {
        const lastUser = localStorage.getItem("guestin.draft.lastUser");
        const saved =
          lastUser && localStorage.getItem("guestin.draft." + lastUser);
        if (!navigator.onLine && saved) {
          draft = JSON.parse(saved);
          user = { id: lastUser, name: "Offline draft", role: "collaborator" };
          applyPreferences();
          editing = true;
          properties = [
            {
              id: draft.propertyId,
              name: "Draft property",
              timezone: localStorage.getItem("guestin.draft.timezone") ?? "UTC",
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
        !recoveryMode &&
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
      localStorage.setItem("guestin.draft." + user.id, JSON.stringify(draft));
      localStorage.setItem("guestin.draft.editId." + user.id, editId);
      localStorage.setItem("guestin.draft.lastUser", user.id);
      localStorage.setItem(
        "guestin.draft.timezone",
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
    currentPassword = newPassword = confirmPassword = "";
    wipeOpen = false;
    wipePassword = "";
    wipeConfirmation = "";
    wipeAcknowledged = false;
    propertyId = "";
    properties = [];
    managedProperties = [];
    deleteTarget = null;
    notesEnabled = false;
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
    staffCodes = false;
    codeStatus = "all";
    error = "";
    notice = "";
    unread = { total: 0, global: 0, properties: {} };
    toast.dismiss();
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
    if (!can("createAccessCodes") && !can("createStaffCodes")) return;
    notesEnabled = false;
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
      staff:
        !can("createAccessCodes") ||
        (can("createStaffCodes") && (value ? !!value.staff : staffCodes)),
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
    const data = codeInputSchema.parse(draft);
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
    localStorage.removeItem("guestin.draft." + user.id);
    editing = false;
    search = "";
    codeDate = data.staff
      ? ""
      : data.grants[0]
        ? dayAt(data.grants[0].start, data.propertyId)
        : (data.breakfast?.start ?? "");
    staffCodes = data.staff;
    codeStatus = data.staff ? "Non revoked" : "all";
    await reload();
    notice = "Access code saved. The guest link is ready to share.";
    if (tourVisible && tourStage === "code" && !editId) {
      tourCodeId = savedCode.id ?? editId;
      tourStage = "install";
      await preferences({ tour: "pending", tourStep: "install", tourCodeId });
    }
  }
  function edit(c: any) {
    notesEnabled = false;
    draft = JSON.parse(
      JSON.stringify({
        propertyId: c.propertyId,
        staff: !!c.staff,
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
    staffCodes = !!c.staff;
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
      "guestin.push." + user.id,
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
  let recoveryMode = $state(""),
    recoveryToken = $state("");
  let tourStage = $state<
    | "property"
    | "door"
    | "code"
    | "install"
    | "notifications"
    | "smtp"
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
            : staffCodes
              ? "Staff codes"
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
    tourStage === "smtp"
      ? "Set up email delivery"
      : tourStage === "property"
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
    tourStage === "smtp"
      ? '[data-tour="smtp"]'
      : tourStage === "property"
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
    tourStage === "smtp"
      ? t(
          "Connect email delivery for verification and password recovery, or continue to use owner-generated reset links.",
        )
      : tourStage === "property"
        ? tab === "Settings" && settingsPage !== "properties"
          ? t("Open Properties to set up your first structure.")
          : tab === "Settings" && !propertyForm
            ? t(
                "Click Add property to give your structure a name and timezone.",
              )
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
        const saved = localStorage.getItem("guestin.draft." + user.id);
        if (saved) {
          draft = JSON.parse(saved);
          const storedId =
            localStorage.getItem("guestin.draft.editId." + user.id) ?? "";
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
      ["install", "notifications", "smtp"].includes(resumeStep)
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
      if (user.role === "owner") {
        await preferences({ tourStep: "smtp", tourCodeId });
        tourStage = "smtp";
      } else tourStage = "done";
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
  ><title>{t("guestin · Host workspace")}</title><meta
    name="description"
    content="Your properties, doors and guest access in one place."
  /></svelte:head
>
<Toaster
  theme={effectiveTheme}
  position="bottom-center"
  closeButton
  offset={{
    bottom: "calc(84px + env(safe-area-inset-bottom))",
    left: "24px",
    right: "24px",
  }}
  mobileOffset={{
    bottom: "calc(84px + env(safe-area-inset-bottom))",
    left: "16px",
    right: "16px",
  }}
/>
<FeedbackToast message={notice ? t(notice) : ""} />
<FeedbackToast message={user && error ? t(error) : ""} kind="error" />
{#if !ready}<div class="auth">{t("Opening your workspace…")}</div>
{:else if recoveryMode}<AccountRecovery
    mode={recoveryMode}
    token={recoveryToken}
    {api}
    onclose={() => {
      recoveryMode = "";
      recoveryToken = "";
      location.href = "/host/";
    }}
  />
{:else if !user}<main class="auth">
    <p class="muted">{t("guestin / host workspace")}</p>
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
    {#if !needsSetup && !invite}<Button
        variant="ghost"
        onclick={() => (recoveryMode = "request")}
        >{t("Forgot password?")}</Button
      >{/if}
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
              {#if properties.length === 1}<span
                  data-testid="structure-title"
                  class="min-w-0 truncate font-semibold"
                  >{properties[0].name}</span
                >
              {:else}<NativeSelect.Root
                  class="w-full"
                  aria-label={t("Structure")}
                  value={editing ? draft.propertyId : propertyId}
                  disabled={editing || doorEditor || propertyForm}
                  onchange={(event) => {
                    propertyId = event.currentTarget.value;
                    changeTourProperty(propertyId);
                  }}
                >
                  {#each properties as p (p.id)}<NativeSelect.Option
                      value={p.id}>{p.name}</NativeSelect.Option
                    >{/each}
                </NativeSelect.Root>{/if}
            </div>
          {:else}<span class="font-semibold">guestin</span>{/if}
        </div>
        <div class="row header-actions">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="icon-button relative"
            aria-label={t("Notifications")}
            title={t("Notification history")}
            onclick={() => navigate("Activity")}
            ><Bell size={20} />
            {#if unread.total > 0}<span
                data-testid="notification-badge"
                class="absolute -right-1 -top-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white"
                aria-label={hostLanguage.current === "it"
                  ? `${unread.total} notifiche non lette`
                  : `${unread.total} unread notifications`}
                >{unread.total > 99 ? "99+" : unread.total}</span
              >{/if}
          </Button><Button
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
    <nav
      class={[
        "app-nav",
        {
          "form-editing": (editing || doorEditor) && !tourVisible,
          "tour-editing": (editing || doorEditor) && tourVisible,
        },
      ]}
      aria-label={t("Main navigation")}
    >
      {#each navigation as item (item.name)}
        {#if item.name === "Create"}<Button
            type="button"
            variant="ghost"
            class="quick-create"
            data-tour="new-code"
            aria-label={t("Create access code")}
            disabled={((editing || doorEditor) && !tourVisible) ||
              !propertyId ||
              busy ||
              !(
                can("createAccessCodes") ||
                can("createStaffCodes") ||
                can("createDoors")
              )}
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
      <div class="page-heading list-page-heading">
        <h1>{t(pageTitle)}</h1>
        {#if user.role === "owner" && propertyId && ((tab === "Codes" && !editing && !detailCodeId) || (tab === "Doors" && !doorEditor && !detailDoorId))}
          {#key tab + propertyId}<HeadingRecordActions
              kind={tab === "Doors" ? "doors" : "codes"}
              {propertyId}
              propertyName={property?.name ?? ""}
              {api}
              {reload}
            />{/key}
        {/if}
      </div>
      <Tour
        open={tourVisible}
        stage={tourStage}
        title={t(tourTitle)}
        text={tourText}
        target={tourTarget}
        onfinish={(result) => void endTour(result)}
      />
      {#if tourVisible && tourStage === "smtp" && user.role === "owner"}
        <SmtpSettings
          {api}
          oncontinue={() => {
            tourStage = "done";
          }}
        />
      {/if}
      {#if tourVisible && (tourStage === "install" || tourStage === "notifications")}
        {#key tourStage}<OnboardingDeviceSetup
            stage={tourStage}
            oncontinue={continueDeviceSetup}
            onenablepush={enablePush}
          />{/key}
      {/if}

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
                class="stack access-code-form"
                onsubmit={(e) => {
                  e.preventDefault();
                  void act(save);
                }}
              >
                <Card.Root class="workspace-card stack">
                  <div class="form-grid">
                    <Label class="field-label"
                      >{t(
                        draft.staff
                          ? "Staff name / label"
                          : "Guest name / label",
                      )}<Input
                        bind:value={draft.label}
                        required
                        placeholder={t("e.g. Maria Rossi")}
                      /></Label
                    >{#if properties.length > 1}<Label class="field-label"
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
                              draft.checkinLink =
                                next?.defaultCheckinLink ?? "";
                            if (
                              !draft.instructionsLink ||
                              draft.instructionsLink ===
                                previous?.defaultInstructionsLink
                            )
                              draft.instructionsLink =
                                next?.defaultInstructionsLink ?? "";
                            draft.propertyId = event.currentTarget.value;
                            draft.grants = [];
                            if (tourVisible)
                              changeTourProperty(draft.propertyId);
                          }}
                          >{#each properties as p, index (p.id ?? index)}<NativeSelect.Option
                              value={p.id}>{p.name}</NativeSelect.Option
                            >{/each}</NativeSelect.Root
                        ></Label
                      >{/if}
                  </div>
                  <div class="access-code-kind">
                    <Label class="inline" for="staff-access-code"
                      ><Switch
                        id="staff-access-code"
                        disabled={!can("createAccessCodes") ||
                          !can("createStaffCodes")}
                        checked={!!draft.staff}
                        onCheckedChange={setStaffCode}
                      />{t("Staff access code")}</Label
                    >
                    {#if draft.staff}<p class="muted">
                        {t(
                          "Time-unrestricted access for cleaners, laundry and other staff. Door permissions and revocation still apply.",
                        )}
                      </p>{/if}
                  </div>
                </Card.Root>
                <Card.Root class="workspace-card">
                  <h2>{t("Door permissions")}</h2>
                  <p class="muted">
                    {#if draft.staff}{t(
                        "No start or end date. Door permissions and single-use rules still apply.",
                      )}{:else}{t("Times use")}
                      {properties.find((p) => p.id === draft.propertyId)
                        ?.timezone}{t(". Each door has its own rules.")}{/if}
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
                          {#if !draft.staff}<Label class="field-label"
                              >{t("Valid from")}<DateInput
                                withTime
                                value={dateInput(grant.start)}
                                onValueChange={(value) =>
                                  changeDate(grant, "start", value)}
                                required
                              /></Label
                            ><Label class="field-label"
                              >{t("Valid until")}<DateInput
                                withTime
                                value={dateInput(grant.end)}
                                onValueChange={(value) =>
                                  changeDate(grant, "end", value)}
                                required
                              /></Label
                            >{/if}<Label class="inline"
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
                        >{t("First breakfast date")}<DateInput
                          bind:value={draft.breakfast.start}
                          required
                        /></Label
                      ><Label class="field-label"
                        >{t("Last breakfast date")}<DateInput
                          bind:value={draft.breakfast.end}
                          required
                        /></Label
                      >
                    </div>{/if}
                </Card.Root>
                <details class="access-additional-details workspace-card">
                  <summary
                    >{hostLanguage.current === "it"
                      ? "Dettagli aggiuntivi"
                      : "Additional details"}</summary
                  >
                  <div class="stack access-additional-content">
                    <Label class="inline" for="internal-notes-enabled"
                      ><Switch
                        id="internal-notes-enabled"
                        bind:checked={notesEnabled}
                      />{t("Internal notes")}</Label
                    >
                    {#if notesEnabled}<Label
                        class="field-label"
                        for="internal-notes"
                        >{t("Notes")}<Textarea
                          id="internal-notes"
                          bind:value={draft.notes}
                        /></Label
                      >{/if}
                    <div class="form-grid">
                      <Label class="field-label"
                        >{t("Online check-in link")}<Input
                          bind:value={draft.checkinLink}
                          type="url"
                          oninvalid={(event) =>
                            event.currentTarget
                              .closest("details")
                              ?.setAttribute("open", "")}
                        /></Label
                      ><Label class="field-label"
                        >{t("Instructions link")}<Input
                          bind:value={draft.instructionsLink}
                          type="url"
                          oninvalid={(event) =>
                            event.currentTarget
                              .closest("details")
                              ?.setAttribute("open", "")}
                        /></Label
                      >
                    </div>
                  </div>
                </details>
                {#if duplicateCodes.length}<p class="notice" role="status">
                    {t(
                      "An identical access code already exists. Saving requires confirmation.",
                    )}
                  </p>{/if}
                <small
                  >{t(
                    "Active permissions are published after the server confirms this save.",
                  )}</small
                >
                <div class="mobile-form-actions access-code-actions">
                  <Button
                    variant="outline"
                    type="button"
                    disabled={busy}
                    onclick={() => {
                      editing = false;
                      localStorage.removeItem("guestin.draft." + user.id);
                      localStorage.removeItem(
                        "guestin.draft.editId." + user.id,
                      );
                    }}>{t("Cancel")}</Button
                  >
                  <Button
                    type="submit"
                    variant="default"
                    class="primary"
                    disabled={busy ||
                      !draft.propertyId ||
                      !canManageCode(draft)}>{t("Save access code")}</Button
                  >
                </div>
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
                    t("Former collaborator")} · {formatInstant(
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
                    disabled={!canManageCode(detailCode)}
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
                        >{t(grantStatus(g, !!detailCode.staff))}</Badge
                      >
                    </div>
                    {#if detailCode.staff}<p>{t("No time limit")}</p>{:else}<p>
                        {formatInstant(g.start, detailCode.propertyId)} → {formatInstant(
                          g.end,
                          detailCode.propertyId,
                        )}<br /><small
                          >{properties.find(
                            (p) => p.id === detailCode.propertyId,
                          )?.timezone}</small
                        >
                      </p>{/if}
                    <small
                      >{t("Successful requests")}: {g.used} · {t(
                        g.singleUse ? "Single use" : "Multiple uses",
                      )}</small
                    >
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy ||
                        !!detailCode.revoked ||
                        !canManageCode(detailCode)}
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
                      {formatDisplayDate(detailCode.breakfast.start)} → {formatDisplayDate(
                        detailCode.breakfast.end,
                      )}
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
                      disabled={!!detailCode.revoked ||
                        busy ||
                        !canManageCode(detailCode)}
                      onclick={() => act(() => replaceLink(detailCode))}
                      >{t("Replace link")}</Button
                    ><Button
                      type="button"
                      variant="destructive"
                      class="danger"
                      disabled={!!detailCode.revoked ||
                        busy ||
                        !canManageCode(detailCode)}
                      onclick={() => act(() => revoke(detailCode))}
                      >{t("Revoke")}</Button
                    >
                  </div>
                  {#if user.role === "owner"}<Button
                      type="button"
                      variant="destructive"
                      disabled={busy}
                      onclick={() => requestDelete("codes", detailCode)}
                      >{t("Delete permanently")}</Button
                    >{/if}
                </details>
              </section>
            {:else}
              <div class="code-list-controls">
                <div
                  class="code-view-tabs"
                  role="group"
                  aria-label={hostLanguage.current === "it"
                    ? "Tipo di codice"
                    : "Code type"}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    aria-pressed={!staffCodes}
                    class={cn("code-view-tab", !staffCodes && "selected")}
                    onclick={() => setStaffCodes(false)}
                    >{hostLanguage.current === "it"
                      ? "Ospiti"
                      : "Guests"}</Button
                  >
                  <Button
                    type="button"
                    variant="ghost"
                    aria-pressed={staffCodes}
                    class={cn("code-view-tab", staffCodes && "selected")}
                    onclick={() => setStaffCodes(true)}
                    >{hostLanguage.current === "it" ? "Staff" : "Staff"}</Button
                  >
                </div>
                <div class="code-list-tools">
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
                          placeholder={t(
                            staffCodes
                              ? "Search staff access…"
                              : "Search guest access…",
                          )}
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
              </div>
              {#if !staffCodes}<div class="calendar-bar code-toolbar">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("Previous day")}
                    onclick={() => shiftDay(-1)}
                    ><ChevronLeft size={18} /></Button
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
                    onclick={() => shiftDay(1)}
                    ><ChevronRight size={18} /></Button
                  >
                  <Button
                    variant="ghost"
                    class="quiet today-button"
                    onclick={() =>
                      (codeDate = dayAt(new Date().toISOString(), propertyId))}
                    >{t("Today")}</Button
                  >
                </div>{/if}
              {#if filtersOpen}<div class="filter-panel">
                  <Label class="field-label"
                    >{t("Status")}<NativeSelect.Root
                      class="w-full"
                      aria-label={t("Status")}
                      bind:value={codeStatus}
                      ><NativeSelect.Option value="all"
                        >{t("All codes")}</NativeSelect.Option
                      >{#each staffCodes ? ["Non revoked", "Revoked", "No available doors"] : ["Non revoked", "Valid now", "Upcoming", "Expired", "Revoked", "No available doors"] as state (state)}<NativeSelect.Option
                          value={state}>{t(state)}</NativeSelect.Option
                        >{/each}</NativeSelect.Root
                    ></Label
                  ><Button
                    type="button"
                    variant="ghost"
                    class="quiet"
                    onclick={() => {
                      codeDate = "";
                      codeStatus = staffCodes ? "Non revoked" : "all";
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
                            {c.breakfastUsed}/{c.breakfast.total}</span
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
                    <CodeRowActions
                      label={c.label}
                      link={c.link}
                      revoked={!!c.revoked}
                      oncopy={() => void copy(c.link)}
                      onshare={() => act(() => prepareShare(c))}
                    />
                  </article>{:else}<div class="empty-state">
                    <KeyRound size={36} />
                    <h2>
                      {t(
                        hasCodeFilters
                          ? "No matching codes"
                          : staffCodes
                            ? "No staff codes yet"
                            : propertyId
                              ? "No codes for this date"
                              : "Your next guest starts here",
                      )}
                    </h2>
                    <p>
                      {t(
                        staffCodes
                          ? "Use + below to create a staff access code."
                          : propertyId
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
                        </p>{/if}{:else if hasCodeFilters}<Button
                        type="button"
                        variant="outline"
                        onclick={() => {
                          search = "";
                          codeDate = "";
                          codeStatus = staffCodes ? "Non revoked" : "all";
                        }}>{t("Clear filters")}</Button
                      >{/if}
                  </div>{/each}
              </Item.Group>{/if}
          {:else if tab === "Activity"}<NotificationHistory
              userId={user.id}
              onread={refreshUnread}
              refreshToken={liveRevision}
              {propertyId}
              propertyName={property?.name ?? ""}
              retentionMonths={property?.notificationRetentionMonths ?? 3}
              maxNotifications={property?.notificationRetentionLimit ?? 1000}
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
              <div class="statistics-table">
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
              </div>
              <div class="statistics-cards">
                {#each stats as s (s.name + s.month)}
                  <article class="statistics-card">
                    <h3>{s.name}</h3>
                    <p class="muted">{s.month}</p>
                    <dl>
                      <div>
                        <dt>{t("Created")}</dt>
                        <dd>{s.created}</dd>
                      </div>
                      <div>
                        <dt>{t("Used")}</dt>
                        <dd>{s.used}</dd>
                      </div>
                      <div>
                        <dt>{t("Attempts")}</dt>
                        <dd>{s.attempts}</dd>
                      </div>
                      <div>
                        <dt>{t("Accepted")}</dt>
                        <dd>{s.accepted}</dd>
                      </div>
                    </dl>
                  </article>
                {:else}<p class="muted">
                    {hostLanguage.current === "it"
                      ? "Nessuna attività da mostrare."
                      : "No activity to show yet."}
                  </p>{/each}
              </div>
            </Card.Root>
          {:else if tab === "Connectors" && can("useBookingConnectors")}<ConnectorManager
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
              canCreate={can("createDoors")}
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
              <EmailVerification {user} {api} />
              <Label class="field-label"
                >{t("Your name")}<Input readonly value={user.name} /></Label
              ><Label class="field-label"
                >{t("Email")}<Input readonly value={user.email ?? ""} /></Label
              >
              <p>
                {t("Role")}: {t(
                  user.role === "owner" ? "Owner / Admin" : "Collaborator",
                )}
              </p>
              <form
                class="stack"
                onsubmit={(event) => {
                  event.preventDefault();
                  void act(changePassword);
                }}
              >
                <h3>{t("Change password")}</h3>
                <p>
                  {t(
                    "Changing your password signs out every device, including this one.",
                  )}
                </p>
                <Label class="field-label"
                  >{t("Current password")}<Input
                    type="password"
                    autocomplete="current-password"
                    bind:value={currentPassword}
                    required
                    maxlength={200}
                  /></Label
                >
                <Label class="field-label"
                  >{t("New password")}<Input
                    type="password"
                    autocomplete="new-password"
                    bind:value={newPassword}
                    required
                    minlength={12}
                    maxlength={200}
                  /></Label
                >
                <Label class="field-label"
                  >{t("Confirm new password")}<Input
                    type="password"
                    autocomplete="new-password"
                    bind:value={confirmPassword}
                    required
                    minlength={12}
                    maxlength={200}
                  /></Label
                >
                <Button type="submit" disabled={busy}
                  >{t("Change password")}</Button
                >
              </form>
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
                      i.group === group &&
                      (!i.owner || user.role === "owner") &&
                      (i.id !== "connectors" || can("useBookingConnectors")),
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
              <div class="space-y-3 rounded-lg border p-4">
                <Label for="date-format"
                  >{hostLanguage.current === "it"
                    ? "Formato data · tutte le app"
                    : "Date format · all apps"}</Label
                >
                <p class="text-sm text-muted-foreground">
                  {hostLanguage.current === "it"
                    ? "Impostazione condivisa per host, ospiti e pagina colazioni. Solo i proprietari possono modificarla."
                    : "Shared by the host, guest and breakfast pages. Only owners can change it."}
                </p>
                <NativeSelect.Root
                  id="date-format"
                  value={dateSettings.format}
                  disabled={busy || user.role !== "owner"}
                  onchange={(event) => {
                    const value = event.currentTarget.value as DateFormat;
                    void act(async () => {
                      await api("settings", { dateFormat: value }, "PUT");
                      dateSettings.format = value;
                    });
                  }}
                >
                  {#each dateFormats as format (format)}<NativeSelect.Option
                      value={format}>{format}</NativeSelect.Option
                    >{/each}
                </NativeSelect.Root>
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
            {:else if settingsPage === "smtp" && user.role === "owner"}
              <SmtpSettings {api} />
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
                        "guestin.push." + user.id,
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
                  {#each user.role === "owner" ? managedProperties : properties as p (p.id)}<div
                      class="stack"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        class="settings-row"
                        disabled={user.role !== "owner" || p.active === false}
                        onclick={() => editProperty(p)}
                        ><Building2 size={21} /><span
                          ><strong>{p.name}</strong><small
                            >{p.timezone} · {p.checkIn} / {p.checkOut}</small
                          ></span
                        >{#if user.role === "owner"}<ChevronRight
                            size={18}
                          />{/if}</Button
                      >
                      {#if user.role === "owner"}<div class="stack px-4 pb-4">
                          {#if p.active === false}<p class="muted">
                              {t("Deactivated")}
                            </p>{/if}
                          <div class="row">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy}
                              onclick={() =>
                                act(async () => {
                                  await api(
                                    `properties/${p.id}/status`,
                                    { active: p.active === false },
                                    "PATCH",
                                  );
                                  await reload();
                                  toast.success(
                                    t(
                                      p.active === false
                                        ? "Structure reactivated"
                                        : "Structure deactivated",
                                    ),
                                  );
                                })}
                              >{t(
                                p.active === false
                                  ? "Reactivate"
                                  : "Deactivate",
                              )}</Button
                            >
                            <Button
                              type="button"
                              variant="destructive"
                              disabled={busy}
                              onclick={() => requestDelete("properties", p)}
                              >{t("Delete permanently")}</Button
                            >
                          </div>
                          <p class="muted">
                            {t(
                              "Deactivation hides this structure and disables guest links while preserving its data.",
                            )}
                          </p>
                        </div>{/if}
                    </div>
                  {:else}<div class="empty-state">
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
                >
                <CollaboratorManager
                  {users}
                  currentUserId={user.id}
                  {api}
                  {reload}
                  onDelete={(account) => requestDelete("users", account)}
                />
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
        open={!!deleteTarget}
        title={t("Delete permanently")}
        onclose={() => {
          if (!busy) deleteTarget = null;
        }}
      >
        <div class="stack">
          <p><strong>{deleteTarget?.name}</strong></p>
          <p>
            {t(
              deleteTarget?.kind === "properties"
                ? "This permanently deletes the structure and all its doors, codes, usage history, notifications and settings. This cannot be undone."
                : deleteTarget?.kind === "users"
                  ? "This permanently deletes this account and revokes all its sessions and notification subscriptions. Workspace data and access codes are preserved. This cannot be undone."
                  : "This permanently deletes this code, its usage history and notifications. Its guest link will stop working. This cannot be undone.",
            )}
          </p>
          <Label class="field-label" for="delete-confirmation"
            >{t("Type to confirm")}: {requiredDeleteConfirmation}<Input
              id="delete-confirmation"
              autocomplete="off"
              bind:value={deleteConfirmation}
              disabled={busy}
            /></Label
          >
          <Button
            type="button"
            variant="destructive"
            disabled={busy || deleteConfirmation !== requiredDeleteConfirmation}
            onclick={() => act(permanentlyDelete)}
            >{t("Delete permanently")}</Button
          >
        </div>
      </Modal>
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
          ></Textarea>
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
          {#if can("createAccessCodes") || can("createStaffCodes")}<Button
              type="button"
              variant="ghost"
              class="settings-row"
              onclick={() => newCode()}
              ><KeyRound size={22} /><span
                ><strong>{t("Create access code")}</strong><small
                  >{t("Choose doors and share a guest link")}</small
                ></span
              ><ChevronRight size={18} /></Button
            >{/if}{#if can("createDoors")}<Button
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
