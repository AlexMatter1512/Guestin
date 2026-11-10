<script lang="ts">
  import { Ellipsis, Download, Upload } from "@lucide/svelte";
  import * as Popover from "$lib/components/ui/popover";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import RecordTransfer from "$lib/components/RecordTransfer.svelte";
  import { hostLanguage } from "$lib/i18n.svelte";
  import type { RecordKind } from "../../../../../shared/record-transfer";

  let {
    kind,
    propertyId,
    propertyName,
    api,
    reload,
  }: {
    kind: RecordKind;
    propertyId: string;
    propertyName: string;
    api: (path: string, body?: any, method?: string) => Promise<any>;
    reload: () => Promise<void>;
  } = $props();
  let menuOpen = $state(false),
    recordsOpen = $state(false);
  const label = $derived(
    hostLanguage.current === "it"
      ? kind === "doors"
        ? "JSON porte"
        : "JSON codici di accesso"
      : kind === "doors"
        ? "Doors JSON"
        : "Access codes JSON",
  );
</script>

<Popover.Root bind:open={menuOpen}>
  <Popover.Trigger
    class={buttonVariants({ variant: "ghost", size: "icon" }) +
      " list-overflow-trigger"}
    aria-label={hostLanguage.current === "it"
      ? "Azioni elenco"
      : "List actions"}
    title={hostLanguage.current === "it" ? "Azioni elenco" : "List actions"}
    ><Ellipsis size={20} /></Popover.Trigger
  >
  <Popover.Content align="end" class="w-64">
    <Button
      type="button"
      variant="ghost"
      class="code-menu-action"
      onclick={() => {
        menuOpen = false;
        recordsOpen = true;
      }}><Download size={16} /><Upload size={16} />{label}</Button
    >
  </Popover.Content>
</Popover.Root>
<RecordTransfer
  {kind}
  {propertyId}
  {propertyName}
  {api}
  {reload}
  showTrigger={false}
  bind:open={recordsOpen}
/>
