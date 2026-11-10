<script lang="ts">
  import { notificationText } from "../../../../../shared/notifications";
  import { flip } from "svelte/animate";
  import { fly } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { untrack } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import NotificationVisual from "$lib/components/NotificationVisual.svelte";
  import { Bell, RefreshCw } from "@lucide/svelte";
  import { hostLanguage, t } from "$lib/i18n.svelte";
  let {
    refreshToken = 0,
    userId,
    onread,
    propertyId,
    propertyName,
    retentionMonths = 3,
    maxNotifications = 1000,
    timezone = "UTC",
    codes,
    api,
  }: {
    refreshToken?: number;
    userId: string;
    onread: () => Promise<void>;
    propertyId: string;
    propertyName: string;
    retentionMonths?: number;
    maxNotifications?: number;
    timezone?: string;
    codes: any[];
    api: (path: string, body?: any, method?: string) => Promise<any>;
  } = $props();
  let events = $state<any[]>([]),
    nextCursor = $state<string | null>(null),
    loading = $state(false),
    error = $state(""),
    markingAll = $state(false),
    clicking = $state<string[]>([]),
    sentinel = $state<HTMLDivElement>();
  let lastRevision = -1;
  let generation = 0,
    pendingRefresh = false;
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  async function load(mode: "reset" | "more" | "refresh" = "reset") {
    if (loading) {
      if (mode === "refresh") pendingRefresh = true;
      return;
    }
    if (mode === "more" && !nextCursor) return;
    const ticket = generation,
      id = propertyId;
    loading = true;
    error = "";
    try {
      let cursor = mode === "more" ? nextCursor : null;
      const desired = mode === "refresh" ? Math.max(20, events.length) : 20;
      let fresh: any[] = [];
      do {
        const query = new URLSearchParams({ propertyId: id, pageSize: "20" });
        if (cursor) query.set("cursor", cursor);
        const data = await api("events?" + query);
        if (ticket !== generation) return;
        fresh.push(...data.events);
        cursor = data.nextCursor;
      } while (mode === "refresh" && cursor && fresh.length < desired);
      const combined = mode === "more" ? [...events, ...fresh] : fresh;
      // Never replace a newer server snapshot with an older duplicate page.
      events = [...new Map(combined.map((e) => [e.id, e])).values()].sort(
        (a, b) =>
          b.created.localeCompare(a.created) || b.id.localeCompare(a.id),
      );
      nextCursor = cursor;
    } catch (e: any) {
      if (ticket === generation) error = e.message;
    } finally {
      if (ticket === generation) {
        loading = false;
        if (pendingRefresh) {
          pendingRefresh = false;
          void load("refresh");
        }
      }
    }
  }
  async function activate(event: any) {
    const ticket = generation;
    clicking = [...clicking, event.id];
    error = "";
    try {
      if (!event.read) await api("events/read", { eventIds: [event.id] });
      if (ticket !== generation) return;
      events = events.map((e) =>
        e.id === event.id
          ? {
              ...e,
              read: true,
              readBy: [...new Set([...(e.readBy ?? []), userId])],
            }
          : e,
      );
      await onread();
      if (ticket === generation && event.href)
        location.hash = new URL(event.href, location.origin).hash;
    } catch (e: any) {
      if (ticket === generation) error = e.message;
    } finally {
      if (ticket === generation)
        clicking = clicking.filter((id) => id !== event.id);
    }
  }
  async function markAll() {
    const ticket = generation;
    markingAll = true;
    error = "";
    try {
      await api("events/read-all", { propertyId });
      if (ticket !== generation) return;
      events = events.map((e) => ({
        ...e,
        read: true,
        readBy: [...new Set([...(e.readBy ?? []), userId])],
      }));
      await onread();
    } catch (e: any) {
      if (ticket === generation) error = e.message;
    } finally {
      if (ticket === generation) markingAll = false;
    }
  }
  $effect(() => {
    const id = propertyId,
      account = userId;
    untrack(() => {
      generation++;
      events = [];
      nextCursor = null;
      loading = false;
      error = "";
      pendingRefresh = false;
      clicking = [];
      markingAll = false;
      if (id && account) void load();
    });
    return () => {
      generation++;
    };
  });
  $effect(() => {
    const revision = refreshToken;
    untrack(() => {
      const previous = lastRevision;
      lastRevision = revision;
      if (previous >= 0 && previous !== revision && propertyId)
        void load("refresh");
    });
  });
  $effect(() => {
    const element = sentinel,
      cursor = nextCursor,
      busy = loading,
      failed = error;
    if (
      !element ||
      !cursor ||
      busy ||
      failed ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting))
          untrack(() => void load("more"));
      },
      { rootMargin: "0px 0px 180px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
  <div>
    <p class="text-sm text-muted-foreground">
      {propertyName} · {l(
        "Shared team history",
        "Cronologia condivisa del team",
      )}
    </p>
    <small
      >{l(
        `Up to ${maxNotifications} notifications are kept for ${retentionMonths} months.`,
        `Vengono conservate fino a ${maxNotifications} notifiche per ${retentionMonths} mesi.`,
      )}</small
    >
  </div>
  <div class="flex items-center gap-2">
    <Button
      variant="outline"
      disabled={loading || markingAll || !propertyId}
      onclick={markAll}
      >{l("Mark all as read", "Segna tutte come lette")}</Button
    >
    <Button
      variant="outline"
      size="icon"
      aria-label={t("Refresh")}
      disabled={loading || !propertyId}
      onclick={() => load()}><RefreshCw size={17} /></Button
    >
  </div>
</div>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<div class="notification-history space-y-3" aria-busy={loading}>
  {#each events as event (event.id)}
    {@const text = notificationText(
      event,
      hostLanguage.current,
      codes.find((c) => c.id === event.code_id)?.label,
    )}
    <div
      animate:flip={{ duration: prefersReducedMotion.current ? 0 : 220 }}
      transition:fly={{
        y: 8,
        duration: prefersReducedMotion.current ? 0 : 180,
      }}
    >
      {#snippet content()}<NotificationVisual
          icon={event.icon}
          thumbnail={event.thumbnail}
        /><span class="min-w-0 flex-1"
          ><span class="mb-1 flex items-start justify-between gap-2"
            ><strong class="text-sm">{text.title}</strong>{#if !event.read}<span
                class="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500"
                aria-label={l("Unread", "Non letta")}
              ></span>{/if}</span
          ><span class="block text-sm">{text.body}</span><small
            class="mt-2 block text-xs text-muted-foreground"
            >{new Date(event.created).toLocaleString(hostLanguage.current, {
              timeZone: timezone,
            })} · {event.read
              ? l("Read", "Letta")
              : l("Unread", "Non letta")}</small
          ></span
        >{/snippet}
      {#if event.href}<a
          class="notification-card flex items-start gap-3 rounded-xl border p-4 text-left"
          data-notification-id={event.id}
          data-unread={!event.read}
          href={event.href}
          onclick={(e) => {
            e.preventDefault();
            if (!clicking.includes(event.id)) void activate(event);
          }}
          aria-busy={clicking.includes(event.id)}>{@render content()}</a
        >
      {:else}<button
          data-slot="notification-action"
          type="button"
          class="notification-card flex w-full items-start gap-3 rounded-xl border p-4 text-left"
          data-notification-id={event.id}
          data-unread={!event.read}
          disabled={clicking.includes(event.id)}
          onclick={() => activate(event)}>{@render content()}</button
        >{/if}
    </div>
  {:else}{#if !loading}<div class="empty-state">
        <Bell size={32} />
        <h2>{l("No notifications yet", "Nessuna notifica")}</h2>
        <p>
          {l(
            "Activity for this structure will appear here for everyone on your team.",
            "L’attività di questa struttura comparirà qui per tutto il team.",
          )}
        </p>
      </div>{/if}{/each}
</div>
<div bind:this={sentinel} class="h-1" data-notification-sentinel></div>
{#if loading}<p
    class="mt-4 text-center text-sm text-muted-foreground"
    role="status"
  >
    {l("Loading notifications…", "Caricamento notifiche…")}
  </p>{/if}
{#if nextCursor}<Button
    variant="outline"
    class="mt-4"
    disabled={loading}
    onclick={() => load("more")}
    >{l("Load older notifications", "Carica notifiche precedenti")}</Button
  >{/if}

<style>
  .notification-card {
    background: var(--card);
    color: var(--card-foreground);
    text-decoration: none;
    transition: background-color 0.15s;
  }
  .notification-card:hover {
    background: var(--accent);
  }
  .notification-card[data-unread="false"] {
    background: var(--muted);
    color: var(--muted-foreground);
  }
  .notification-card[data-unread="false"] :global(.notification-visual) {
    filter: grayscale(1);
    opacity: 0.65;
  }
  .notification-card:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 3px;
  }
</style>
