<script lang="ts">
  import { untrack } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Bell, RefreshCw } from "@lucide/svelte";
  import { hostLanguage, t } from "$lib/i18n.svelte";
  let {
    propertyId,
    propertyName,
    retentionMonths = 3,
    timezone = "UTC",
    codes,
    api,
  }: {
    propertyId: string;
    propertyName: string;
    retentionMonths?: number;
    timezone?: string;
    codes: any[];
    api: (path: string) => Promise<any>;
  } = $props();
  let events = $state<any[]>([]),
    nextCursor = $state<string | null>(null),
    loading = $state(false),
    error = $state("");
  let request = 0;
  const labels: Record<string, string> = {
    "code.created": "Access code created",
    "code.updated": "Access code updated",
    "code.revoked": "Access code revoked",
    "code.permission": "Door permission changed",
    "door.deleted": "Door deleted",
    "device.test.accepted": "Door test accepted",
    "device.test.failed": "Door test failed",
    "device.test.uncertain": "Door test uncertain",
    "device.test.resolved": "Door test resolved",
    "device.resolved": "Device request resolved",
    "access.accepted": "Access accepted",
    "access.denied": "Access denied",
    "access.failed": "Device failures",
    "access.uncertain": "Uncertain requests",
    "access.invalid": "Invalid guest links",
    "breakfast.redeemed": "Breakfast usage",
    "breakfast.denied": "Rejected breakfasts",
  };
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  async function load(more = false) {
    const id = propertyId,
      ticket = ++request;
    loading = true;
    error = "";
    try {
      const query = new URLSearchParams({ propertyId: id, pageSize: "50" });
      if (more && nextCursor) query.set("cursor", nextCursor);
      const data = await api("events?" + query);
      if (ticket !== request) return;
      events = more ? [...events, ...data.events] : data.events;
      nextCursor = data.nextCursor;
    } catch (e) {
      if (ticket === request) error = (e as Error).message;
    } finally {
      if (ticket === request) loading = false;
    }
  }
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

<div class="mb-6 flex items-start justify-between gap-4">
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
  <Button
    variant="outline"
    size="icon"
    aria-label={t("Refresh")}
    disabled={loading || !propertyId}
    onclick={() => load()}><RefreshCw size={17} /></Button
  >
</div>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<div class="notification-history space-y-3" aria-busy={loading}>
  {#each events as event (event.id)}
    <Card.Root
      ><Card.Content class="pt-4"
        ><div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <strong>{t(labels[event.type] ?? event.type)}</strong><small
            >{new Date(event.created).toLocaleString(hostLanguage.current, {
              timeZone: timezone,
            })}</small
          >
        </div>
        <p>{event.message}</p>
        {#if event.code_id}<small
            >{codes.find((code) => code.id === event.code_id)?.label ??
              ""}</small
          >{/if}</Card.Content
      ></Card.Root
    >
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
