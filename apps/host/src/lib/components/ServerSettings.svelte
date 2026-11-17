<script lang="ts">
  import { onMount } from "svelte";
  import { hostLanguage } from "$lib/i18n.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import Modal from "$lib/components/Modal.svelte";
  import {
    serverInfoSchema,
    type ServerInfo,
    type UpdateChannel,
  } from "../../../../../shared/server-updates";
  import browserBuild from "../../../../../shared/build.json";
  import { refreshInstalledApp, refreshAttemptKey } from "$lib/app-update";

  let {
    api,
  }: { api: (path: string, body?: any, method?: string) => Promise<any> } =
    $props();
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  let info = $state<ServerInfo | null>(null);
  let channel = $state<UpdateChannel>("latest");
  let busy = $state(false),
    error = $state(""),
    message = $state("");
  let popup = $state(false),
    shown = "",
    stopped = false;
  let attempted = $state("");
  const stale = $derived(
    !!info?.current.id && info.current.id !== browserBuild.id,
  );
  const failedRefresh = $derived(stale && attempted === info?.current.id);
  const image = $derived(info ? `${info.current.image}:${info.channel}` : "");
  const label = (build: { version: string; id: string; commit: string }) =>
    `${build.version}${build.commit ? ` (${build.commit.slice(0, 8)})` : build.id ? ` (${build.id})` : ""}`;
  const status = $derived(
    info?.error
      ? l(
          "Could not check for updates",
          "Impossibile controllare gli aggiornamenti",
        )
      : info?.status === "available"
        ? l(
            "An image update is available",
            "È disponibile un aggiornamento dell’immagine",
          )
        : info?.status === "current"
          ? l("This server is up to date", "Questo server è aggiornato")
          : info?.status === "ahead"
            ? l(
                "This server is newer than the selected release",
                "Questo server è più recente della versione selezionata",
              )
            : l(
                "The installed build cannot be compared",
                "Impossibile confrontare la build installata",
              ),
  );

  async function check(refresh = false) {
    if (busy || stopped) return;
    busy = true;
    error = "";
    try {
      const result = serverInfoSchema.parse(
        await api(`admin/server${refresh ? "?refresh=1" : ""}`),
      );
      if (stopped) return;
      info = result;
      channel = result.channel;
      const key = `${result.channel}:${result.published?.id}`;
      if (result.status === "available" && shown !== key) {
        shown = key;
        popup = true;
      }
      if (result.current.id === browserBuild.id) {
        attempted = "";
        try {
          sessionStorage.removeItem(refreshAttemptKey);
        } catch {
          /* Storage is optional. */
        }
      }
    } catch (e) {
      if (!stopped) error = e instanceof Error ? e.message : String(e);
    } finally {
      if (!stopped) busy = false;
    }
  }
  async function save() {
    if (busy) return;
    busy = true;
    error = message = "";
    try {
      await api("admin/server", { channel }, "PUT");
      if (stopped) return;
      message = l("Update channel saved", "Canale aggiornamenti salvato");
    } catch (e) {
      if (!stopped) error = e instanceof Error ? e.message : String(e);
      return;
    } finally {
      if (!stopped) busy = false;
    }
    await check();
  }
  async function refreshApp() {
    if (busy || !info) return;
    busy = true;
    error = "";
    try {
      await refreshInstalledApp(info.current.id);
    } catch (e) {
      if (!stopped) error = e instanceof Error ? e.message : String(e);
    } finally {
      if (!stopped) busy = false;
    }
  }
  onMount(() => {
    try {
      attempted = sessionStorage.getItem(refreshAttemptKey) ?? "";
    } catch {
      /* Storage is optional. */
    }
    void check();
    const resume = () => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = setInterval(resume, 60000);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  });
</script>

<section class="card stack" data-server-settings>
  <h2>{l("Server updates", "Aggiornamenti server")}</h2>
  <p class="muted">
    {l(
      "Choose which published Docker image to check. Only owners can manage this setting.",
      "Scegli quale immagine Docker pubblicata controllare. Solo i proprietari possono gestire questa impostazione.",
    )}
  </p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if message}<p role="status">{message}</p>{/if}
  <form
    class="stack"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <Label for="server-update-channel"
      >{l("Update channel", "Canale aggiornamenti")}</Label
    >
    <select
      id="server-update-channel"
      bind:value={channel}
      disabled={busy || !info}
    >
      <option value="latest"
        >{l("Latest releases (latest)", "Ultime versioni (latest)")}</option
      >
      <option value="edge"
        >{l("Every tag build (edge)", "Ogni build da tag (edge)")}</option
      >
    </select>
    <p class="muted">
      {l(
        "This changes update checks for this installation. To install an update, configure the same image tag in Docker Compose or Portainer and recreate the container.",
        "Questo modifica i controlli per questa installazione. Per installare un aggiornamento, configura lo stesso tag immagine in Docker Compose o Portainer e ricrea il container.",
      )}
    </p>
    <div class="row">
      <Button type="submit" disabled={busy || !info || channel === info.channel}
        >{l("Save channel", "Salva canale")}</Button
      >
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onclick={() => check(true)}
        >{busy
          ? l("Checking…", "Controllo…")
          : l("Check now", "Controlla ora")}</Button
      >
    </div>
  </form>
  {#if info}
    <dl class="build-details">
      <dt>{l("Running server", "Server in esecuzione")}</dt>
      <dd>{label(info.current)}</dd>
      <dt>{l("Following", "Canale seguito")}</dt>
      <dd><code>{image}</code></dd>
      <dt>{l("Published image", "Immagine pubblicata")}</dt>
      <dd>{info.published ? label(info.published) : "—"}</dd>
      <dt>{l("Last check", "Ultimo controllo")}</dt>
      <dd>{new Date(info.checkedAt).toLocaleString(hostLanguage.current)}</dd>
    </dl>
    <p role="status">{status}</p>
    {#if info.error}<p class="muted">{info.error}</p>{/if}
    {#if info.status === "available"}<Button
        variant="outline"
        onclick={() => (popup = true)}
        >{l("View update", "Vedi aggiornamento")}</Button
      >{/if}
  {/if}
</section>

<section class="card stack">
  <h2>{l("App on this device", "App su questo dispositivo")}</h2>
  <p>{label(browserBuild)}</p>
  {#if stale}<p role="status">
      {l(
        "The server has changed. Refresh this app to load its current version.",
        "Il server è cambiato. Aggiorna questa app per caricare la versione corrente.",
      )}
    </p>{/if}
  <Button variant="outline" disabled={busy || !info} onclick={refreshApp}
    >{l("Refresh app", "Aggiorna app")}</Button
  >
  {#if failedRefresh}<p role="alert">
      {l(
        "This app still has an older build after refreshing. Close all GuestIn windows and reopen it. If it remains outdated, remove the installed shortcut and install GuestIn again. Do not clear your browser data.",
        "Questa app usa ancora una build precedente dopo l’aggiornamento. Chiudi tutte le finestre di GuestIn e riaprila. Se resta obsoleta, rimuovi il collegamento installato e installa di nuovo GuestIn. Non cancellare i dati del browser.",
      )}
    </p>{/if}
</section>

<Modal
  open={popup && info?.status === "available"}
  title={l("Server update available", "Aggiornamento server disponibile")}
  onclose={() => (popup = false)}
>
  {#if info?.published}<div class="stack">
      <p>
        {l(
          "A different published image is available on your selected channel.",
          "Sul canale selezionato è disponibile una nuova immagine pubblicata.",
        )}
      </p>
      <p><strong>{label(info.published)}</strong></p>
      <code class="image-reference">{image}</code>
      <p>
        {l(
          "Back up your installation, then pull this image and recreate the container in Docker Compose or Portainer. Your running server will not change until you do this.",
          "Esegui un backup dell’installazione, poi scarica questa immagine e ricrea il container in Docker Compose o Portainer. Il server in esecuzione non cambierà fino ad allora.",
        )}
      </p>
      <Button onclick={() => (popup = false)}>{l("Close", "Chiudi")}</Button>
    </div>{/if}
</Modal>

<style>
  .build-details {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 0.75rem;
  }
  dt {
    color: var(--muted-foreground);
  }
  dd,
  .image-reference {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  @media (max-width: 480px) {
    .build-details {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.25rem;
    }
    dd {
      margin-bottom: 0.75rem;
    }
  }
</style>
