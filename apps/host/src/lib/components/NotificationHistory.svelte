<script lang="ts">
  import { notificationText } from "../../../../../shared/notifications";
  import { flip } from "svelte/animate";
  import { fly } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { untrack, onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Bell, RefreshCw } from "@lucide/svelte";
  import { hostLanguage, t } from "$lib/i18n.svelte";
  let {
    refreshToken = 0,
    userId,
    onread,
    propertyId,
    propertyName,
    retentionMonths = 3,
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
    timezone?: string;
    codes: any[];
    api: (path: string, body?: any, method?: string) => Promise<any>;
  } = $props();
  let events = $state<any[]>([]),
    nextCursor = $state<string | null>(null),
    loading = $state(false),
    error = $state("");
  let request = 0;
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  async function markRead(items: any[], ticket: number) {
    if (document.visibilityState !== "visible") return;
    const ids = items.filter((event) => !event.read).map((event) => event.id);
    for (let offset = 0; offset < ids.length; offset += 100) {
      if (ticket !== request) return;
      const batch = ids.slice(offset, offset + 100);
      await api("events/read", { eventIds: batch });
      if (ticket !== request) return;
      events = events.map((event) =>
        batch.includes(event.id)
          ? {
              ...event,
              read: true,
              readBy: [...new Set([...(event.readBy ?? []), userId])],
            }
          : event,
      );
    }
    if (ids.length) await onread();
  }
  async function markAll() {
    try {
      await api("events/read-all", { propertyId });
      events = events.map((event) => ({
        ...event,
        read: true,
        readBy: [...new Set([...(event.readBy ?? []), userId])],
      }));
      await onread();
    } catch (e) {
      error = (e as Error).message;
    }
  }
  onMount(() => {
    const resume = () => {
      if (document.visibilityState === "visible")
        void markRead(events, request).catch((e) => {
          error = e.message;
        });
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  });
  async function load(more = false, refresh = false) {
    const id = propertyId,
      ticket = ++request;
    loading = true;
    error = "";
    try {
      const query = new URLSearchParams({ propertyId: id, pageSize: "50" });
      if (more && nextCursor) query.set("cursor", nextCursor);
      const data = await api("events?" + query);
      if (ticket !== request) return;
      const combined = more
        ? [...events, ...data.events]
        : refresh
          ? [...data.events, ...events]
          : data.events;
      events = [
        ...new Map(combined.map((event: any) => [event.id, event])).values(),
      ].sort(
        (a: any, b: any) =>
          b.created.localeCompare(a.created) || b.id.localeCompare(a.id),
      );
      if (!refresh) nextCursor = data.nextCursor;
      await markRead(data.events, ticket);
    } catch (e) {
      if (ticket === request) error = (e as Error).message;
    } finally {
      if (ticket === request) loading = false;
    }
  }
  $effect(() => {
    const revision = refreshToken;
    if (revision)
      untrack(() => {
        if (propertyId) void load(false, true);
      });
  });
  $effect(() => {
    const id = propertyId;
    untrack(() => {
      events = [];
      nextCursor = null;
      loading = false;
      if (id) void load();
    });
    return () => {
      request++;
    };
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
        `Notifications are kept for ${retentionMonths} months.`,
        `Le notifiche vengono conservate per ${retentionMonths} mesi.`,
      )}</small
    >
  </div>
  <div class="flex items-center gap-2">
    <Button
      variant="outline"
      disabled={loading || !propertyId}
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
      codes.find((code) => code.id === event.code_id)?.label,
    )}
    <div
      animate:flip={{ duration: prefersReducedMotion.current ? 0 : 220 }}
      transition:fly={{
        y: 8,
        duration: prefersReducedMotion.current ? 0 : 180,
      }}
    >
      <Card.Root data-notification-id={event.id} data-unread={!event.read}
        ><Card.Content class="pt-4"
          ><div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <strong>{text.title}</strong><small
              >{new Date(event.created).toLocaleString(hostLanguage.current, {
                timeZone: timezone,
              })}</small
            >
          </div>
          <p>{text.body}</p>
        </Card.Content></Card.Root
      >
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
{#if nextCursor}<Button
    variant="outline"
    class="mt-5"
    disabled={loading}
    onclick={() => load(true)}
    >{l("Load older notifications", "Carica notifiche precedenti")}</Button
  >{/if}
