<script lang="ts">
  import { type Snippet } from "svelte";
  import { X } from "@lucide/svelte";
  import { t } from "$lib/i18n.svelte";
  let {
    open,
    title,
    onclose,
    children,
  }: { open: boolean; title: string; onclose: () => void; children: Snippet } =
    $props();
  let dialog = $state<HTMLDialogElement>();
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="app-modal"
  aria-label={title}
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
>
  <header class="modal-header">
    <h2>{title}</h2>
    <button class="icon-button" aria-label={t("Close")} onclick={onclose}
      ><X size={20} /></button
    >
  </header>
  <div class="modal-body">
    {#if open}{@render children()}{/if}
  </div>
</dialog>
