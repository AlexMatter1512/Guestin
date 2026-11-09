<script lang="ts">
  import type { HostLocale } from "$lib/i18n.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Languages, Check } from "@lucide/svelte";
  let {
    open,
    suggested,
    onconfirm,
  }: {
    open: boolean;
    suggested: HostLocale;
    onconfirm: (locale: HostLocale, start: boolean) => void;
  } = $props();
  let selected = $derived(suggested);
</script>

<Dialog.Root {open}>
  <Dialog.Content
    showCloseButton={false}
    class="max-h-[90dvh] overflow-y-auto p-6 sm:max-w-md"
    onInteractOutside={(event) => event.preventDefault()}
    onEscapeKeydown={(event) => event.preventDefault()}
  >
    <Dialog.Header>
      <div
        class="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted"
      >
        <Languages size={23} />
      </div>
      <Dialog.Title class="text-xl leading-snug"
        >Choose your language<br /><span class="text-muted-foreground"
          >Scegli la tua lingua</span
        ></Dialog.Title
      >
      <Dialog.Description class="leading-relaxed"
        >Choose the language for the app and guided setup.<br />Scegli la lingua
        dell’app e della configurazione guidata.</Dialog.Description
      >
    </Dialog.Header>
    <fieldset class="my-2 grid gap-3">
      <legend class="mb-3 text-sm font-medium">Language / Lingua</legend>
      {#each [{ id: "en", label: "English" }, { id: "it", label: "Italiano" }] as language (language.id)}
        <label
          class="language-option"
          class:selected={selected === language.id}
        >
          <input
            type="radio"
            name="host-language"
            value={language.id}
            bind:group={selected}
          />
          <span lang={language.id}>{language.label}</span>
          {#if selected === language.id}<Check
              size={17}
              aria-hidden="true"
            />{/if}
        </label>
      {/each}
    </fieldset>
    <div class="grid gap-2">
      <Button onclick={() => onconfirm(selected, true)}
        >Continue / Continua</Button
      >
      <Button variant="ghost" onclick={() => onconfirm(selected, false)}
        >Skip tour / Salta il tour</Button
      >
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  .language-option {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--border);
    padding: 16px;
    border-radius: 10px;
    cursor: pointer;
  }
  .language-option span {
    flex: 1;
    font-size: 15px;
    font-weight: 500;
  }
  .selected {
    border-color: var(--foreground);
    background: var(--muted);
  }
  input {
    accent-color: var(--foreground);
    width: 16px;
    height: 16px;
  }
</style>
