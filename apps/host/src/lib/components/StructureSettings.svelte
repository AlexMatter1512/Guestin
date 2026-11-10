<script lang="ts">
  import FeedbackToast from "$lib/components/FeedbackToast.svelte";
  import { untrack } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { ExternalLink, LockKeyhole } from "@lucide/svelte";
  import { hostLanguage } from "$lib/i18n.svelte";
  let {
    property,
    mode,
    owner,
    api,
    reload,
  }: {
    property: any;
    mode: "notifications" | "breakfast";
    owner: boolean;
    api: (path: string, data?: any, method?: string) => Promise<any>;
    reload: () => Promise<void>;
  } = $props();
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  let months = $state(3),
    enabled = $state(false),
    password = $state(""),
    busy = $state(false),
    error = $state(""),
    notice = $state("");
  let loadedId = "",
    loadedRetention = 3,
    loadedProtected = false,
    operation = 0;
  $effect(() => {
    const id = property?.id,
      retention = property?.notificationRetentionMonths ?? 3,
      protectedPage = property?.breakfastProtected ?? false;
    untrack(() => {
      if (loadedId !== id) {
        operation++;
        busy = false;
        months = retention;
        enabled = protectedPage;
        password = "";
        error = "";
        notice = "";
      } else {
        if (loadedRetention !== retention) months = retention;
        if (loadedProtected !== protectedPage) enabled = protectedPage;
      }
      loadedId = id;
      loadedRetention = retention;
      loadedProtected = protectedPage;
    });
  });
  async function save() {
    const id = property.id,
      ticket = ++operation;
    const current = () => property?.id === id && ticket === operation;
    busy = true;
    error = "";
    notice = "";
    try {
      if (mode === "notifications")
        await api(
          `properties/${id}/notifications`,
          { retentionMonths: months },
          "PATCH",
        );
      else
        await api(
          `properties/${id}/breakfast-settings`,
          { enabled, ...(enabled && password ? { password } : {}) },
          "PUT",
        );
      await reload();
      if (current()) notice = l("Settings saved.", "Impostazioni salvate.");
    } catch (e) {
      if (current()) error = (e as Error).message;
    } finally {
      if (current()) {
        busy = false;
        password = "";
      }
    }
  }
</script>

{#if property}
  <Card.Root class="mb-6">
    <Card.Header>
      <Card.Title
        >{mode === "notifications"
          ? l("Shared notification history", "Cronologia notifiche condivisa")
          : l("Breakfast page", "Pagina colazioni")}</Card.Title
      >
      <Card.Description>{property.name}</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-5">
      {#if mode === "notifications"}
        <p class="text-muted-foreground">
          {l(
            "Everyone on your team sees this structure’s history. Push filters only change what this device receives.",
            "Tutto il team vede la cronologia di questa struttura. I filtri push modificano solo ciò che riceve questo dispositivo.",
          )}
        </p>
        <form
          class="stack"
          onsubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div class="grid gap-2">
            <Label for="notification-retention"
              >{l(
                "Keep notifications for (months)",
                "Conserva le notifiche per (mesi)",
              )}</Label
            ><Input
              id="notification-retention"
              type="number"
              min="1"
              max="120"
              required
              bind:value={months}
            />
          </div>
          <p class="text-sm text-muted-foreground">
            {l(
              "Older notifications are automatically deleted. Shortening this period permanently removes older history; statistics are kept.",
              "Le notifiche più vecchie vengono eliminate automaticamente. Ridurre il periodo rimuove definitivamente la cronologia precedente; le statistiche restano.",
            )}
          </p>
          <Button class="w-fit" type="submit" disabled={busy}
            >{l("Save retention", "Salva conservazione")}</Button
          >
        </form>
      {:else}
        <p class="text-muted-foreground">
          {l(
            "See how many breakfasts guests have used. Guest names and access codes never appear here.",
            "Visualizza quante colazioni hanno utilizzato gli ospiti. Nomi e codici di accesso non compaiono qui.",
          )}
        </p>
        <Button
          href={"/breakfast/" + property.id}
          target="_blank"
          rel="noreferrer"
          variant="outline"
          ><ExternalLink />{l(
            "Open breakfast page",
            "Apri pagina colazioni",
          )}</Button
        >
        <form
          class="stack"
          onsubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div class="flex items-center justify-between gap-4">
            <Label for="protect-breakfast" class="gap-2"
              ><LockKeyhole size={16} />{l(
                "Require a password",
                "Richiedi una password",
              )}</Label
            ><Switch
              id="protect-breakfast"
              bind:checked={enabled}
              disabled={!owner || busy}
            />
          </div>
          {#if enabled && owner}<div class="grid gap-2">
              <Label for="breakfast-password"
                >{property.breakfastProtected
                  ? l(
                      "New password (leave empty to keep it)",
                      "Nuova password (lascia vuoto per mantenerla)",
                    )
                  : l(
                      "Breakfast page password",
                      "Password pagina colazioni",
                    )}</Label
              ><Input
                id="breakfast-password"
                type="password"
                autocomplete="new-password"
                minlength={8}
                maxlength={128}
                required={!property.breakfastProtected}
                bind:value={password}
              /><small
                >{l(
                  "Use at least 8 characters. Share it only with people who need breakfast totals.",
                  "Usa almeno 8 caratteri. Condividila solo con chi deve vedere i totali delle colazioni.",
                )}</small
              >
            </div>{/if}
          {#if owner}<Button class="w-fit" type="submit" disabled={busy}
              >{l(
                "Save breakfast settings",
                "Salva impostazioni colazioni",
              )}</Button
            >{:else}<p class="text-sm text-muted-foreground">
              {l(
                "An owner can change password protection. Signed-in hosts can open the page directly.",
                "Un proprietario può modificare la protezione. Gli host connessi possono aprire direttamente la pagina.",
              )}
            </p>{/if}
        </form>
      {/if}
      {#if error}<p role="alert" class="text-sm text-destructive">
          {error}
        </p>{/if}
      <FeedbackToast message={notice} />
    </Card.Content>
  </Card.Root>
{:else}<p class="muted">
    {l(
      "Add or select a structure first.",
      "Aggiungi o seleziona prima una struttura.",
    )}
  </p>{/if}
