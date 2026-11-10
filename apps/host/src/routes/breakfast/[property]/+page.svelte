<script lang="ts">
  import { demoCafeTotals } from "../../../../../../shared/demo-guest";
  const demoMode = import.meta.env.MODE === "demo";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { parseDate, type DateValue } from "@internationalized/date";
  import { RangeCalendar } from "$lib/components/ui/range-calendar";
  import * as Popover from "$lib/components/ui/popover";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Toaster } from "$lib/components/ui/sonner";
  import { toast } from "svelte-sonner";
  import { CalendarDays, Bell, RefreshCw } from "@lucide/svelte";
  import {
    dateSettings,
    formatDisplayDate,
    formatDisplayDateTime,
  } from "$lib/date-settings.svelte";

  let language = $state<"en" | "it">("en");
  const l = (en: string, it: string) => (language === "it" ? it : en);
  const propertyId = $derived(page.params.property);
  const endpoint = $derived(
    `/api/v1/public/breakfast/${encodeURIComponent(propertyId ?? "")}`,
  );
  type Totals = {
    property: string;
    timezone: string;
    date: string;
    today: number;
    thisMonth: number;
    lastMonth: number;
    total: number;
    dateFormat: typeof dateSettings.format;
    from: string;
    to: string;
  };
  let data = $state<Totals | null>(null),
    locked = $state(false),
    password = $state(""),
    error = $state(""),
    busy = $state(false),
    updated = $state<number | null>(null);
  let range = $state<{
    start: DateValue | undefined;
    end: DateValue | undefined;
  }>({ start: undefined, end: undefined });
  let pickerOpen = $state(false),
    connected = $state(false),
    notifications = $state(false),
    notificationStatus = $state("");
  let socket: WebSocket | undefined,
    reconnect: ReturnType<typeof setTimeout> | undefined,
    stopped = true,
    revision = 0,
    backoff = 1000;
  const rangeLabel = $derived(
    range.start && range.end
      ? `${formatDisplayDate(range.start.toString())} – ${formatDisplayDate(range.end.toString())}`
      : l("Choose date range", "Scegli intervallo date"),
  );
  async function load(notify = false) {
    const ticket = ++revision;
    const query =
      range.start && range.end
        ? "?" +
          new URLSearchParams({
            from: range.start.toString(),
            to: range.end.toString(),
          })
        : "";
    try {
      const response = demoMode
        ? new Response(
            JSON.stringify(
              demoCafeTotals(
                range.start?.toString(),
                range.end?.toString(),
                propertyId,
              ),
            ),
          )
        : await fetch(endpoint + query, { cache: "no-store" });
      const next = await response.json();
      if (ticket !== revision || stopped) return;
      if (response.status === 401 && next.requiresPassword) {
        locked = true;
        data = null;
        socket?.close();
        return;
      }
      if (!response.ok) {
        if ([403, 404].includes(response.status)) {
          data = null;
          socket?.close();
        }
        throw Error(next.error);
      }
      const previous = data;
      dateSettings.format = next.dateFormat;
      data = next;
      locked = false;
      updated = Date.now();
      error = "";
      if (!range.start && !range.end)
        range = { start: parseDate(next.from), end: parseDate(next.to) };
      if (
        notify &&
        previous &&
        previous.date === next.date &&
        next.today > previous.today &&
        notifications
      ) {
        const quantity = next.today - previous.today;
        const message = l(
          `${quantity} ${quantity === 1 ? "breakfast" : "breakfasts"} used · ${next.today} today`,
          `${quantity} ${quantity === 1 ? "colazione utilizzata" : "colazioni utilizzate"} · ${next.today} oggi`,
        );
        toast(message);
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(
              `${next.property} · ${l("Breakfast", "Colazioni")}`,
              { body: message, tag: "guestin-breakfast-" + propertyId },
            );
          } catch {
            /* In-page notification remains available on browsers requiring push for native delivery. */
          }
        }
      }
      if (!socket && !stopped) connect();
    } catch (reason) {
      if (ticket === revision && !stopped)
        error = l(
          "Unable to load totals. Please try again.",
          "Impossibile caricare i totali. Riprova.",
        );
    }
  }
  function connect() {
    if (demoMode) {
      connected = true;
      return;
    }
    if (stopped || locked || socket || !data) return;
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${endpoint}/live`,
    );
    socket = ws;
    ws.onopen = () => {
      connected = true;
      backoff = 1000;
    };
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (
          ["sync", "breakfast.changed", "workspace.changed"].includes(
            message.type,
          )
        )
          void load(message.type === "breakfast.changed");
      } catch {
        /* Ignore invalid frames. */
      }
    };
    ws.onclose = (event) => {
      if (socket !== ws) return;
      socket = undefined;
      connected = false;
      if (stopped) return;
      if (event.code === 1008) {
        void load();
        return;
      }
      reconnect = setTimeout(() => {
        void load();
      }, backoff);
      backoff = Math.min(30000, backoff * 2);
    };
    ws.onerror = () => ws.close();
  }
  async function unlock(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = "";
    try {
      const r = await fetch(endpoint + "/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) throw Error();
      await load();
    } catch {
      error = l(
        "Unable to unlock. Check the password and try again.",
        "Impossibile accedere. Controlla la password e riprova.",
      );
    } finally {
      busy = false;
      password = "";
    }
  }
  async function toggleNotifications() {
    if (demoMode) {
      notifications = !notifications;
      notificationStatus = "page";
      return;
    }
    if (notifications) {
      notifications = false;
      notificationStatus = "";
    } else {
      notifications = true;
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        try {
          await Notification.requestPermission();
        } catch {
          /* In-page alerts still work. */
        }
      }
      notificationStatus =
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
          ? "native"
          : "page";
    }
    try {
      localStorage.setItem(
        "guestin.breakfast.notifications." + propertyId,
        String(notifications),
      );
    } catch {
      /* Optional preference. */
    }
  }
  onMount(() => {
    stopped = false;
    const selected = new URL(location.href).searchParams.get("lang");
    try {
      language = (
        selected ??
        localStorage.getItem("guestin.breakfast.language") ??
        navigator.language
      ).startsWith("it")
        ? "it"
        : "en";
      notifications =
        localStorage.getItem(
          "guestin.breakfast.notifications." + propertyId,
        ) === "true";
    } catch {
      language = navigator.language.startsWith("it") ? "it" : "en";
    }
    void load();
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      revision++;
      clearInterval(timer);
      clearTimeout(reconnect);
      socket?.close();
      socket = undefined;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  });
</script>

<svelte:head
  ><title>{l("Breakfast totals", "Totali colazioni")} · Guestin</title><meta
    name="robots"
    content="noindex"
  /></svelte:head
>
<main
  lang={language}
  class="mx-auto min-h-screen max-w-4xl space-y-6 p-4 py-8 sm:p-8"
>
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <p class="text-sm text-muted-foreground">
        Guestin / {l("Breakfast", "Colazioni")}
      </p>
      <h1 class="mt-2 text-2xl font-semibold">
        {data?.property ?? l("Breakfasts used", "Colazioni utilizzate")}
      </h1>
    </div>
    <Button
      variant="outline"
      aria-label={l("Switch to Italian", "Passa all’inglese")}
      onclick={() => {
        language = language === "en" ? "it" : "en";
        try {
          localStorage.setItem("guestin.breakfast.language", language);
        } catch {}
      }}>{language === "en" ? "Italiano" : "English"}</Button
    >
  </header>
  {#if locked}
    <section
      id="unlock"
      class="max-w-md space-y-4 rounded-xl border bg-card p-6"
    >
      <h2 class="text-lg font-semibold">
        {l("Password required", "Password richiesta")}
      </h2>
      <p class="text-sm text-muted-foreground">
        {l(
          "Enter the password shared by your host to view breakfast usage.",
          "Inserisci la password condivisa dall’host per vedere le colazioni utilizzate.",
        )}
      </p>
      <form class="space-y-4" onsubmit={unlock}>
        <Label for="password"
          >{l("Breakfast page password", "Password pagina colazioni")}</Label
        ><Input
          id="password"
          type="password"
          bind:value={password}
          required
          maxlength={128}
          autocomplete="current-password"
        /><Button type="submit" disabled={busy}
          >{l("Open breakfast totals", "Apri totali colazioni")}</Button
        >
      </form>
    </section>
  {:else if data}
    <div id="totals" class="space-y-6">
      <h2 class="text-lg font-semibold">
        {l("Breakfasts used", "Colazioni utilizzate")}
      </h2>
      <p class="text-sm text-muted-foreground">
        {l(
          "Confirmed breakfasts used by guests.",
          "Colazioni effettivamente utilizzate dagli ospiti.",
        )}
      </p>
      <section
        class="grid gap-4 sm:grid-cols-3"
        aria-label={l("Breakfast totals", "Totali colazioni")}
      >
        {#each [[l("Used today", "Utilizzate oggi"), data.today, "today"], [l("Used this month", "Utilizzate questo mese"), data.thisMonth, "month"], [l("Used last month", "Utilizzate il mese scorso"), data.lastMonth, "last"]] as [label, count, id] (id)}<article
            class="rounded-xl border bg-card p-6"
          >
            <h2 class="text-sm text-muted-foreground">{label}</h2>
            <strong
              id={String(id)}
              class="mt-2 block text-4xl font-semibold"
              aria-live="polite">{count}</strong
            >
          </article>{/each}
      </section>
      <section class="space-y-4 rounded-xl border bg-card p-6">
        <h2 class="font-semibold">
          {l(
            "Breakfasts used in a date range",
            "Colazioni utilizzate in un intervallo di date",
          )}
        </h2>
        <Popover.Root bind:open={pickerOpen}
          ><Popover.Trigger
            class={buttonVariants({ variant: "outline" }) +
              " max-w-full justify-start"}
            aria-label={l("Choose date range", "Scegli intervallo date")}
            ><CalendarDays size={16} />{rangeLabel}</Popover.Trigger
          ><Popover.Content
            class="w-auto max-w-[calc(100vw-2rem)] p-1"
            align="start"
            ><RangeCalendar
              bind:value={range}
              locale={language}
              weekStartsOn={1}
              class="[--cell-size:2.25rem]"
              onValueChange={(value) => {
                if (value.start && value.end) {
                  pickerOpen = false;
                  void load();
                }
              }}
            /></Popover.Content
          ></Popover.Root
        >
        <p id="total" aria-live="polite">
          {l(
            "Used in selected range",
            "Utilizzate nell’intervallo selezionato",
          )}:
          <strong>{data.total}</strong>
        </p>
      </section>
      <div class="flex flex-wrap items-center gap-3">
        <Button variant="outline" onclick={toggleNotifications}
          ><Bell size={16} />{notifications
            ? l("Disable notifications", "Disattiva notifiche")
            : l("Enable notifications", "Attiva notifiche")}</Button
        ><Button
          variant="ghost"
          aria-label={l("Refresh totals", "Aggiorna totali")}
          onclick={() => void load()}><RefreshCw size={16} /></Button
        ><span role="status" class="text-sm text-muted-foreground"
          >{connected
            ? l("Live updates connected", "Aggiornamenti in tempo reale attivi")
            : l(
                "Reconnecting · totals refresh automatically",
                "Riconnessione · i totali si aggiornano automaticamente",
              )}</span
        >
      </div>
      <p class="text-xs text-muted-foreground">
        {l(
          "Optional notifications work while this page is open.",
          "Le notifiche facoltative funzionano mentre questa pagina è aperta.",
        )}{notificationStatus === "page"
          ? " " +
            l(
              "Browser notifications unavailable; in-page alerts enabled.",
              "Notifiche del browser non disponibili; avvisi nella pagina attivi.",
            )
          : ""}
      </p>
      {#if updated}<p id="updated" class="text-xs text-muted-foreground">
          {l("Updated", "Aggiornato")}: {formatDisplayDateTime(
            updated,
            data.timezone,
          )} · {data.timezone}
        </p>{/if}
    </div>
  {:else}<p role="status">{l("Loading totals…", "Caricamento totali…")}</p>{/if}
  {#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
</main>
<Toaster
  containerAriaLabel={l("Notifications", "Notifiche")}
  closeButtonAriaLabel={l("Close notification", "Chiudi notifica")}
/>
