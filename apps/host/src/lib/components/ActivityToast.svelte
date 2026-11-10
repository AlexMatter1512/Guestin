<script lang="ts">
  import { X } from "@lucide/svelte";
  import NotificationVisual from "$lib/components/NotificationVisual.svelte";
  import { Button } from "$lib/components/ui/button";
  import { t } from "$lib/i18n.svelte";
  let {
    event,
    title,
    body,
    activate,
    closeToast = () => {},
  }: {
    event: any;
    title: string;
    body: string;
    activate: (event: any) => Promise<void>;
    closeToast?: () => void;
  } = $props();
  let busy = $state(false),
    error = $state("");
  async function open() {
    busy = true;
    try {
      await activate(event);
      closeToast();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }
</script>

<div
  class="flex w-[var(--width)] items-start gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
  data-activity-toast={event.id}
>
  <button
    data-slot="notification-action"
    type="button"
    class="flex min-w-0 flex-1 items-start gap-3 text-left"
    disabled={busy}
    onclick={open}
  >
    <NotificationVisual icon={event.icon} thumbnail={event.thumbnail} />
    <span class="min-w-0"
      ><strong class="block text-sm">{title}</strong><span
        class="mt-1 block text-xs">{body}</span
      >{#if error}<span class="error" role="alert">{error}</span>{/if}</span
    >
  </button>
  <Button
    type="button"
    variant="ghost"
    size="icon"
    aria-label={t("Close")}
    class="size-6 shrink-0"
    onclick={closeToast}><X size={15} /></Button
  >
</div>
