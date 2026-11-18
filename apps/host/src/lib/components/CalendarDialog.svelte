<script lang="ts">
  import type { Snippet } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { buttonVariants } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";

  let {
    open = $bindable(false),
    triggerRef = $bindable(null),
    title,
    label = title,
    id,
    disabled = false,
    variant = "outline",
    triggerClass,
    trigger,
    children,
  }: {
    open?: boolean;
    triggerRef?: HTMLButtonElement | null;
    title: string;
    label?: string;
    id?: string;
    disabled?: boolean;
    variant?: "outline" | "ghost";
    triggerClass?: string;
    trigger: Snippet;
    children: Snippet;
  } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger
    {id}
    {disabled}
    bind:ref={triggerRef}
    aria-label={label}
    class={cn(buttonVariants({ variant }), triggerClass)}
  >
    {@render trigger()}
  </Dialog.Trigger>
  <Dialog.Content
    class="w-fit max-w-[calc(100vw-1rem)] max-h-[90dvh] gap-3 overflow-auto p-4 shadow-lg [--picker-cell-size:clamp(2rem,10vw,2.5rem)]"
    aria-describedby={undefined}
  >
    <Dialog.Title class="flex min-h-6 items-center pr-8 text-sm font-semibold">{title}</Dialog.Title>
    <div class="mx-auto grid max-w-full gap-2">{@render children()}</div>
  </Dialog.Content>
</Dialog.Root>
