<script lang="ts">
  import {
    KeyRound,
    DoorOpen,
    TriangleAlert,
    Coffee,
    Bell,
  } from "@lucide/svelte";
  import type { NotificationIcon } from "../../../../../shared/notification-presentation";
  let {
    icon = "bell",
    thumbnail = null,
  }: { icon?: NotificationIcon; thumbnail?: string | null } = $props();
  let failed = $state(false);
  $effect(() => {
    thumbnail;
    failed = false;
  });
  const Icon = $derived(
    {
      key: KeyRound,
      door: DoorOpen,
      danger: TriangleAlert,
      coffee: Coffee,
      bell: Bell,
    }[icon] ?? Bell,
  );
</script>

<span
  class="notification-visual flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"
  data-icon={icon}
  aria-hidden="true"
>
  {#if thumbnail && !failed}<img
      src={thumbnail}
      alt=""
      width="48"
      height="48"
      loading="lazy"
      class="size-full object-cover"
      onerror={() => (failed = true)}
    />
  {:else}<Icon
      size={23}
      class={icon === "danger" ? "text-destructive" : "text-muted-foreground"}
    />{/if}
</span>
