<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { hostLanguage } from "$lib/i18n.svelte";

  let {
    doorId,
    api,
  }: {
    doorId: string;
    api: (path: string) => Promise<{ config: Record<string, string> }>;
  } = $props();
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  let config = $state<Record<string, string> | null>(null);
  let error = $state("");
  let retry = $state(0);
  $effect(() => {
    const id = doorId;
    void retry;
    let current = true;
    config = null;
    error = "";
    api(`doors/${encodeURIComponent(id)}/config`).then(
      (result) => {
        if (current) config = result.config;
      },
      (reason) => {
        if (current) error = (reason as Error).message;
      },
    );
    return () => {
      current = false;
    };
  });
  function label(key: string) {
    return (
      (
        {
          url: l("Webhook URL", "URL webhook"),
          method: l("HTTP method", "Metodo HTTP"),
          headers: l("Headers", "Header"),
          body: l("Request body", "Corpo della richiesta"),
          response_mode: l("Success response", "Risposta di successo"),
        } as Record<string, string>
      )[key] ?? key
    );
  }
</script>

<section
  class="min-w-0 space-y-3 rounded-lg border p-4"
  aria-label={l(
    "Saved device configuration",
    "Configurazione dispositivo salvata",
  )}
>
  <h3 class="font-medium">
    {l("Saved device configuration", "Configurazione dispositivo salvata")}
  </h3>
  {#if error}
    <p role="alert" class="text-sm text-destructive">{error}</p>
    <Button type="button" variant="outline" onclick={() => retry++}
      >{l("Retry", "Riprova")}</Button
    >
  {:else if config === null}
    <p role="status" class="text-sm text-muted-foreground">
      {l("Loading configuration…", "Caricamento configurazione…")}
    </p>
  {:else if Object.keys(config).length === 0}
    <p class="text-sm text-muted-foreground">
      {l(
        "No saved device configuration.",
        "Nessuna configurazione dispositivo salvata.",
      )}
    </p>
  {:else}
    <dl class="min-w-0 space-y-3 text-sm">
      {#each Object.entries(config) as [key, value] (key)}
        <div class="min-w-0 space-y-1">
          <dt class="text-muted-foreground">{label(key)}</dt>
          <dd>
            <pre
              class="whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-xs">{value ||
                "—"}</pre>
          </dd>
        </div>
      {/each}
    </dl>
  {/if}
</section>
