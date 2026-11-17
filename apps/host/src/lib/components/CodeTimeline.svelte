<script lang="ts">
  import { untrack } from "svelte";
  import {
    Check,
    KeyRound,
    DoorOpen,
    Coffee,
    Bell,
    TriangleAlert,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    dateSettings,
    formatDisplayDateTime,
  } from "$lib/date-settings.svelte";
  import { hostLanguage, t } from "$lib/i18n.svelte";
  import {
    notificationText,
    type NotificationContext,
  } from "../../../../../shared/notifications";
  import { notificationIcon } from "../../../../../shared/notification-presentation";

  let {
    codeId,
    propertyId,
    timezone = "UTC",
    refreshToken = 0,
    fullHistory = false,
    api,
  }: {
    codeId: string;
    propertyId: string;
    timezone?: string;
    refreshToken?: number;
    fullHistory?: boolean;
    api: (path: string, body?: any, method?: string) => Promise<any>;
  } = $props();
  type CodeEvent = {
    id: string;
    type: string;
    message: string;
    created: string;
    context?: NotificationContext;
  };
  let events = $state<CodeEvent[]>([]);
  const visibleEvents = $derived(fullHistory ? events : events.slice(0, 10));
  let nextCursor = $state<string | null>(null);
  let loading = $state(true);
  let error = $state("");
  let requestId = 0;
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;

  async function load(mode: "refresh" | "more" = "refresh") {
    const ticket = ++requestId;
    const id = codeId;
    const property = propertyId;
    const pageSize = fullHistory ? 20 : 10;
    const desired =
      mode === "refresh" && fullHistory
        ? Math.max(pageSize, events.length)
        : pageSize;
    let cursor = mode === "more" ? nextCursor : null;
    loading = true;
    error = "";
    try {
      const fresh: CodeEvent[] = [];
      do {
        const query = new URLSearchParams({
          codeId: id,
          propertyId: property,
          pageSize: String(pageSize),
        });
        if (cursor) query.set("cursor", cursor);
        const data = await api("events?" + query);
        if (ticket !== requestId) return;
        fresh.push(...data.events);
        cursor = data.nextCursor;
      } while (mode === "refresh" && cursor && fresh.length < desired);
      const combined = mode === "more" ? [...events, ...fresh] : fresh;
      events = [
        ...new Map(combined.map((event) => [event.id, event])).values(),
      ].sort(
        (a, b) =>
          b.created.localeCompare(a.created) || b.id.localeCompare(a.id),
      );
      nextCursor = cursor;
    } catch (e: any) {
      if (ticket === requestId) error = e.message;
    } finally {
      if (ticket === requestId) loading = false;
    }
  }

  $effect(() => {
    codeId;
    propertyId;
    refreshToken;
    fullHistory;
    untrack(() => void load());
    return () => {
      requestId++;
    };
  });
</script>

<section
  class="code-timeline"
  aria-label={l("Access code activity", "Attività del codice")}
  aria-busy={loading}
>
  <div class="timeline-heading">
    <h3>{t("Activity")}</h3>
    <small>{l("Newest first", "Più recenti prima")}</small>
  </div>
  <ol class="timeline-events">
    {#each visibleEvents as event (event.id)}
      {@const text = notificationText(
        { ...event, context: { ...event.context, codeLabel: undefined } },
        hostLanguage.current,
        undefined,
        dateSettings.format,
      )}
      {@const success = /\.(accepted|redeemed)$/.test(event.type)}
      {@const warning = /\.(failed|denied|invalid|uncertain)$/.test(event.type)}
      {@const Icon = success
        ? Check
        : {
            key: KeyRound,
            door: DoorOpen,
            coffee: Coffee,
            danger: TriangleAlert,
            bell: Bell,
          }[notificationIcon(event.type)]}
      <li class="timeline-event" data-event-id={event.id}>
        <span
          class={["timeline-marker", { success, warning }]}
          aria-hidden="true"><Icon size={17} strokeWidth={2.5} /></span
        >
        <div class="timeline-content">
          <time datetime={event.created}
            >{formatDisplayDateTime(event.created, timezone)}</time
          >
          <strong>{text.title}</strong>
          {#if text.body}<p>{text.body}</p>{/if}
        </div>
      </li>
    {/each}
  </ol>
  {#if !events.length && !loading && !error}<p class="timeline-empty">
      {l("No events yet.", "Nessun evento.")}
    </p>{/if}
  {#if loading}<p class="timeline-feedback" role="status">
      {l("Loading activity…", "Caricamento attività…")}
    </p>{/if}
  {#if error}
    <p class="error" role="alert">{error}</p>
    <Button
      type="button"
      variant="outline"
      disabled={loading}
      onclick={() => load()}>{l("Try again", "Riprova")}</Button
    >
  {:else if !fullHistory && (nextCursor || events.length > 10)}
    <Button
      variant="outline"
      href={`#/codes/${encodeURIComponent(codeId)}/activity`}
      >{l("View all", "Vedi tutto")}</Button
    >
  {:else if nextCursor}
    <Button
      type="button"
      variant="outline"
      disabled={loading}
      onclick={() => load("more")}
      >{l("Load older events", "Carica eventi precedenti")}</Button
    >
  {/if}
</section>

<style>
  .code-timeline {
    padding-top: 12px;
  }
  .timeline-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 24px;
  }
  .timeline-heading h3 {
    margin: 0;
  }
  .timeline-heading small,
  time,
  .timeline-feedback,
  .timeline-empty {
    color: var(--muted-foreground);
  }
  .timeline-events {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .timeline-event {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    column-gap: 18px;
    position: relative;
    padding-bottom: 28px;
  }
  .timeline-event:not(:last-child)::before {
    content: "";
    position: absolute;
    width: 2px;
    background: var(--border);
    left: 14px;
    top: 38px;
    bottom: 8px;
    border-radius: 2px;
  }
  .timeline-marker {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--muted);
    color: var(--muted-foreground);
  }
  .timeline-marker.success {
    background: #22a874;
    color: white;
  }
  .timeline-marker.warning {
    background: var(--destructive);
    color: white;
  }
  .timeline-content {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  time {
    display: block;
    font-size: 13px;
    line-height: 20px;
    margin: 4px 0 6px;
  }
  strong {
    display: block;
    font-size: 15px;
    line-height: 1.5;
    font-weight: 600;
  }
  .timeline-content p {
    font-size: 13px;
    line-height: 1.6;
    margin: 6px 0 0;
    color: var(--muted-foreground);
  }
  .timeline-feedback,
  .timeline-empty {
    font-size: 14px;
    margin: 0 0 20px;
  }
</style>
