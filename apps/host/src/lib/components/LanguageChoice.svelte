<script lang="ts">
  import type { HostLocale } from "$lib/i18n.svelte";
  let {
    open,
    suggested,
    onconfirm,
  }: {
    open: boolean;
    suggested: HostLocale;
    onconfirm: (locale: HostLocale, start: boolean) => void;
  } = $props();
  let selected = $state<HostLocale>("en");
  let dialog: HTMLDialogElement;
  $effect(() => {
    if (!dialog) return;
    if (open) {
      selected = suggested;
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="language-title"
  aria-describedby="language-description"
  oncancel={(e) => e.preventDefault()}
>
  <p class="eyebrow">oshost</p>
  <h2 id="language-title">
    Choose your language<br /><span>Scegli la tua lingua</span>
  </h2>
  <p id="language-description">
    Choose the language for the app and guided setup.<br />Scegli la lingua
    dell’app e della configurazione guidata.
  </p>
  <fieldset>
    <legend>Language / Lingua</legend><label class:selected={selected === "en"}
      ><input
        type="radio"
        name="host-language"
        value="en"
        bind:group={selected}
      /><span lang="en">English</span></label
    ><label class:selected={selected === "it"}
      ><input
        type="radio"
        name="host-language"
        value="it"
        bind:group={selected}
      /><span lang="it">Italiano</span></label
    >
  </fieldset>
  <button class="primary" onclick={() => onconfirm(selected, true)}
    >Continue / Continua</button
  >
  <button class="skip" onclick={() => onconfirm(selected, false)}
    >Skip tour / Salta il tour</button
  >
</dialog>

<style>
  dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(440px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    overflow: auto;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 28px;
    color: var(--foreground);
    background: var(--background);
    box-shadow: 0 18px 70px #142d3330;
  }
  dialog::backdrop {
    background: #15252355;
    backdrop-filter: blur(2px);
  }
  .eyebrow {
    font-size: 13px;
    font-weight: 700;
    color: var(--foreground);
    margin: 0 0 18px;
  }
  h2 {
    font-size: 25px;
    line-height: 1.3;
    margin: 0 0 14px;
  }
  h2 span {
    font-size: 21px;
    color: var(--muted-foreground);
  }
  p {
    font-size: 14px;
    color: var(--muted-foreground);
    line-height: 1.65;
  }
  fieldset {
    padding: 0;
    border: 0;
    margin: 24px 0;
    display: grid;
    gap: 10px;
  }
  legend {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 10px;
    color: var(--muted-foreground);
  }
  label {
    display: flex;
    align-items: center;
    flex-direction: row;
    gap: 12px;
    border: 1px solid var(--border);
    padding: 15px;
    border-radius: 10px;
    font-size: 16px;
    cursor: pointer;
  }
  .selected {
    border-color: var(--foreground);
    background: var(--secondary);
  }
  input {
    accent-color: var(--foreground);
  }
  button {
    width: 100%;
    margin-top: 8px;
  }
  .skip {
    background: transparent;
    border: 0;
    font-size: 12px;
    color: var(--muted-foreground);
  }
  :global(:root[data-theme="dark"]) dialog {
    color: var(--foreground);
    background: var(--background);
    border-color: var(--border);
    box-shadow: 0 18px 70px #0008;
  }
  :global(:root[data-theme="dark"]) dialog::backdrop {
    background: #080e0cb3;
  }
  :global(:root[data-theme="dark"]) .eyebrow {
    color: var(--foreground);
  }
  :global(:root[data-theme="dark"]) h2 span,
  :global(:root[data-theme="dark"]) p,
  :global(:root[data-theme="dark"]) legend,
  :global(:root[data-theme="dark"]) .skip {
    color: var(--muted-foreground);
  }
  :global(:root[data-theme="dark"]) label {
    border-color: var(--border);
  }
  :global(:root[data-theme="dark"]) .selected {
    border-color: var(--foreground);
    background: var(--secondary);
  }
  :global(:root[data-theme="dark"]) input {
    accent-color: var(--foreground);
  }
  @media (max-width: 420px) {
    dialog {
      padding: 22px;
    }
    h2 {
      font-size: 23px;
    }
  }
</style>
