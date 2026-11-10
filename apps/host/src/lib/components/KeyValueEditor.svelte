<script lang="ts">
  import { Plus, X } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { hostLanguage } from "$lib/i18n.svelte";
  import {
    emptyPair,
    type KeyValuePair,
  } from "../../../../../shared/key-value";
  let {
    rows = $bindable([emptyPair()]),
    label,
  }: { rows?: KeyValuePair[]; label: string } = $props();
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  const canAdd = $derived(
    rows.every((row) => row.key.trim() && row.value.trim()),
  );
</script>

<fieldset class="space-y-3">
  <legend class="mb-2 text-sm font-medium">{label}</legend>
  {#each rows as row, index (index)}<div class="flex items-center gap-2">
      <Input
        aria-label={`${label} ${l("key", "chiave")} ${index + 1}`}
        placeholder={l("Key", "Chiave")}
        bind:value={row.key}
        autocomplete="off"
        class="min-w-0 flex-1"
      />
      <Input
        aria-label={`${label} ${l("value", "valore")} ${index + 1}`}
        placeholder={l("Value", "Valore")}
        bind:value={row.value}
        autocomplete="off"
        class="min-w-0 flex-1"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${l("Remove", "Rimuovi")} ${label} ${index + 1}`}
        onclick={() => {
          rows = rows.filter((_, i) => i !== index);
          if (!rows.length) rows = [emptyPair()];
        }}><X size={16} /></Button
      >
    </div>{/each}
  <Button
    type="button"
    variant="outline"
    disabled={!canAdd}
    onclick={() => (rows = [...rows, emptyPair()])}
    aria-label={`${l("Add", "Aggiungi")} ${label}`}
    ><Plus size={16} />{l("Add row", "Aggiungi riga")}</Button
  >
</fieldset>
