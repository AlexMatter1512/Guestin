<script lang="ts">
  import FeedbackToast from "$lib/components/FeedbackToast.svelte";
  import { untrack } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { hostLanguage } from "$lib/i18n.svelte";
  let {
    property,
    owner,
    api,
    reload,
  }: {
    property: any;
    owner: boolean;
    api: (path: string, body?: any, method?: string) => Promise<any>;
    reload: () => Promise<void>;
  } = $props();
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  let checkin = $state(""),
    instructions = $state(""),
    busy = $state(false),
    message = $state(""),
    error = $state("");
  let request = 0;
  $effect(() => {
    const id = property?.id,
      a = property?.defaultCheckinLink ?? "",
      b = property?.defaultInstructionsLink ?? "";
    untrack(() => {
      request++;
      checkin = a;
      instructions = b;
      message = "";
      error = "";
      busy = false;
    });
  });
  async function save() {
    if (busy || !property) return;
    const id = property?.id,
      ticket = ++request;
    busy = true;
    message = "";
    error = "";
    try {
      await api(
        `properties/${id}/links`,
        {
          defaultCheckinLink: checkin.trim(),
          defaultInstructionsLink: instructions.trim(),
        },
        "PATCH",
      );
      await reload();
      if (property?.id === id)
        message = l("Default links saved.", "Link predefiniti salvati.");
    } catch (e) {
      if (ticket === request) error = (e as Error).message;
    } finally {
      if (property?.id === id) busy = false;
    }
  }
</script>

<Card.Root>
  <Card.Header
    ><Card.Title>{l("Guest links", "Link ospiti")}</Card.Title><Card.Description
      >{property?.name ??
        l(
          "Select a structure first.",
          "Seleziona prima una struttura.",
        )}</Card.Description
    ></Card.Header
  >
  <Card.Content>
    <form
      class="space-y-5"
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p class="text-sm text-muted-foreground">
        {l(
          "These links prefill new access codes for this structure. Integrations can replace them with guest-specific links; you can always edit the draft.",
          "Questi link compilano i nuovi codici di questa struttura. Le integrazioni possono sostituirli con link specifici per l’ospite; puoi sempre modificare la bozza.",
        )}
      </p>
      <div class="space-y-2">
        <Label for="default-checkin"
          >{l("Default check-in link", "Link check-in predefinito")}</Label
        ><Input
          id="default-checkin"
          type="url"
          bind:value={checkin}
          disabled={!owner || busy || !property}
          placeholder="https://…"
        />
      </div>
      <div class="space-y-2">
        <Label for="default-instructions"
          >{l(
            "Default instructions link",
            "Link istruzioni predefinito",
          )}</Label
        ><Input
          id="default-instructions"
          type="url"
          bind:value={instructions}
          disabled={!owner || busy || !property}
          placeholder="https://…"
        />
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}<FeedbackToast
        {message}
      />
      {#if owner}<Button type="submit" disabled={busy || !property}
          >{l("Save default links", "Salva link predefiniti")}</Button
        >{:else}<p class="text-sm text-muted-foreground">
          {l(
            "An owner can change these defaults.",
            "Un proprietario può modificare questi valori.",
          )}
        </p>{/if}
    </form>
  </Card.Content>
</Card.Root>
