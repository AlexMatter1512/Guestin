<script lang="ts">
  import { Toaster as Sonner, type ToasterProps } from "svelte-sonner";
  import {
    CircleCheck,
    Info,
    TriangleAlert,
    CircleX,
    LoaderCircle,
  } from "@lucide/svelte";
  let { theme = "system", ...props }: ToasterProps = $props();
</script>

<Sonner
  {theme}
  class="toaster group"
  style="--normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border); --border-radius: var(--radius);"
  {...props}
>
  {#snippet successIcon()}<CircleCheck class="size-4" />{/snippet}
  {#snippet infoIcon()}<Info class="size-4" />{/snippet}
  {#snippet warningIcon()}<TriangleAlert class="size-4" />{/snippet}
  {#snippet errorIcon()}<CircleX class="size-4" />{/snippet}
  {#snippet loadingIcon()}<LoaderCircle class="size-4 animate-spin" />{/snippet}
</Sonner>
