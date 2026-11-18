<script lang="ts">
  import { untrack } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { hostLanguage } from "$lib/i18n.svelte";
  import { contactName, sampleContact } from "$lib/guest-contact";
  import { fieldLabel } from "$lib/kross-fields";
  let {
    contactNameFormat,
    availableFields,
    selectedFields,
    onSave,
  }: {
    contactNameFormat: string;
    availableFields: string[];
    selectedFields: string[];
    onSave: (format: string, fields: Record<string, boolean>) => Promise<void>;
  } = $props();
  let formatDraft = $state(untrack(() => contactNameFormat));
  let chosen = $state(untrack(() => [...selectedFields]));
  let pending = $state(false),
    error = $state("");
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  async function save() {
    if (!formatValid || pending) return;
    pending = true;
    error = "";
    try {
      await onSave(
        formatDraft.trim(),
        Object.fromEntries(
          availableFields.map((key) => [key, chosen.includes(key)]),
        ),
      );
    } catch (e) {
      error = (e as Error).message;
    } finally {
      pending = false;
    }
  }
  let formatInput = $state<HTMLInputElement | null>(null);
  function insertPlaceholder(key: string) {
    const input = formatInput;
    if (!input) return;
    const start = input.selectionStart ?? formatDraft.length;
    const end = input.selectionEnd ?? start;
    const token = "{" + key + "}";
    if (formatDraft.length - (end - start) + token.length > 180) return;
    input.setRangeText(token, start, end, "end");
    formatDraft = input.value;
    input.focus();
  }
  const formatValid = $derived(
    formatDraft.trim().length > 0 &&
      !/[{}]/.test(
        formatDraft.replace(
          /\{(name|arrival|departure|dates|rooms|property|reservation)\}/g,
          "",
        ),
      ),
  );
</script>

<form
  class="grid gap-3"
  onsubmit={(event) => {
    event.preventDefault();
    void save();
  }}
>
  <Label for="contact-format"
    >{l("Contact name format", "Formato nome contatto")}</Label
  >
  <Input
    id="contact-format"
    bind:ref={formatInput}
    bind:value={formatDraft}
    maxlength={180}
  />
  <div class="flex flex-wrap gap-1">
    {#each Object.keys(sampleContact) as key (key)}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onclick={() => insertPlaceholder(key)}>{"{" + key + "}"}</Button
      >
    {/each}
  </div>
  <p class="text-sm text-muted-foreground">
    {l("Preview", "Anteprima")} · {contactName(formatDraft, sampleContact)}
  </p>
  {#if !formatValid}<p role="alert">
      {l(
        "Enter a name format using the listed placeholders.",
        "Inserisci un formato usando i segnaposto elencati.",
      )}
    </p>{/if}
  <fieldset class="grid gap-2">
    <legend class="mb-2 font-semibold"
      >{l("Reservation fields", "Campi prenotazione")}</legend
    >
    <p class="text-sm text-muted-foreground">
      {l(
        "Choose what you see when you open a reservation. These settings apply to your account.",
        "Scegli cosa vedere quando apri una prenotazione. Queste impostazioni si applicano al tuo account.",
      )}
    </p>
    <div class="grid gap-1 sm:grid-cols-2">
      {#each availableFields as key (key)}
        <Label
          for={"kross-field-" + encodeURIComponent(key)}
          class="flex items-center gap-3 py-2"
        >
          <Checkbox
            id={"kross-field-" + encodeURIComponent(key)}
            checked={chosen.includes(key)}
            onCheckedChange={(checked) => {
              chosen = checked
                ? [...chosen, key]
                : chosen.filter((value) => value !== key);
            }}
          />{fieldLabel(key, hostLanguage.current === "it")}
        </Label>
      {/each}
    </div>
  </fieldset>
  {#if error}<p role="alert">{error}</p>{/if}
  <Button type="submit" disabled={!formatValid || pending}
    >{l("Save", "Salva")}</Button
  >
</form>
