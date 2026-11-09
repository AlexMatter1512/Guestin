<script lang="ts">
  import type { Snippet } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { X } from "@lucide/svelte";
  import { t } from "$lib/i18n.svelte";
  let {
    open,
    title,
    onclose,
    children,
  }: { open: boolean; title: string; onclose: () => void; children: Snippet } =
    $props();
</script>

<Dialog.Root
  {open}
  onOpenChange={(value) => {
    if (!value) onclose();
  }}
>
  <Dialog.Content
    showCloseButton={false}
    class="workspace-dialog gap-0 p-0 sm:max-w-xl"
  >
    <Dialog.Header
      class="flex-row items-center justify-between border-b px-6 py-5"
    >
      <Dialog.Title class="text-lg font-semibold">{title}</Dialog.Title>
      <Dialog.Description class="sr-only">{title}</Dialog.Description>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("Close")}
        onclick={onclose}><X size={20} /></Button
      >
    </Dialog.Header>
    <div class="min-h-0 overflow-y-auto p-6">
      {#if open}{@render children()}{/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.workspace-dialog) {
    max-height: 85dvh;
    display: flex;
    flex-direction: column;
  }
  @media (max-width: 640px) {
    :global(.workspace-dialog) {
      top: auto;
      bottom: 0;
      left: 0;
      transform: none;
      width: 100%;
      max-width: 100%;
      max-height: 90dvh;
      border-radius: 20px 20px 0 0;
      padding-bottom: env(safe-area-inset-bottom);
    }
  }
</style>
