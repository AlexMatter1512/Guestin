<script lang="ts">
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Drawer from "$lib/components/ui/drawer";
  import { Button } from "$lib/components/ui/button";
  import { X } from "@lucide/svelte";
  import { t } from "$lib/i18n.svelte";
  let {
    open,
    title,
    onclose,
    children,
  }: {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
  } = $props();
  const desktop = new MediaQuery("(min-width: 768px)");
  function changed(value: boolean) {
    if (!value) onclose();
  }
</script>

{#snippet closeButton()}
  <Button variant="ghost" size="icon" aria-label={t("Close")} onclick={onclose}
    ><X size={20} /></Button
  >
{/snippet}
{#snippet body()}
  <div
    class="modal-scroll min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6"
  >
    {#if open}{@render children()}{/if}
  </div>
{/snippet}

{#if desktop.current}
  <Dialog.Root {open} onOpenChange={changed}>
    <Dialog.Content
      showCloseButton={false}
      class="workspace-dialog max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
    >
      <Dialog.Header
        class="flex-row items-center justify-between border-b px-6 py-4"
      >
        <Dialog.Title class="text-lg font-semibold">{title}</Dialog.Title>
        <Dialog.Description class="sr-only">{title}</Dialog.Description>
        {@render closeButton()}
      </Dialog.Header>
      {@render body()}
    </Dialog.Content>
  </Dialog.Root>
{:else}
  <Drawer.Root {open} onOpenChange={changed} shouldScaleBackground={false}>
    <Drawer.Content
      class="workspace-drawer overflow-hidden pb-[env(safe-area-inset-bottom)]"
    >
      <Drawer.Header
        class="flex-row items-center justify-between border-b px-5 py-3 text-left"
      >
        <Drawer.Title class="text-lg font-semibold">{title}</Drawer.Title>
        <Drawer.Description class="sr-only">{title}</Drawer.Description>
        {@render closeButton()}
      </Drawer.Header>
      {@render body()}
    </Drawer.Content>
  </Drawer.Root>
{/if}

<style>
  :global(.workspace-dialog) {
    display: flex;
  }
  :global(.workspace-drawer) {
    max-height: 90dvh;
  }
  .modal-scroll {
    scrollbar-gutter: stable;
  }
</style>
