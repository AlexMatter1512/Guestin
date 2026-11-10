<script lang="ts">
  import { Bell, Check, Download, Smartphone } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import * as Card from "$lib/components/ui/card";
  import { hostLanguage } from "$lib/i18n.svelte";
  import { appInstallation } from "$lib/app-installation.svelte";

  let {
    stage,
    oncontinue,
    onenablepush,
  }: {
    stage: "install" | "notifications";
    oncontinue: () => Promise<void>;
    onenablepush: () => Promise<void>;
  } = $props();
  let busy = $state(false);
  let message = $state("");
  let enabled = $state(false);
  const copy = (english: string, italian: string) =>
    hostLanguage.current === "it" ? italian : english;
  const pushSupported = $derived(
    appInstallation.ready &&
      appInstallation.secure &&
      typeof Notification !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      (!appInstallation.ios || appInstallation.installed),
  );

  async function install() {
    busy = true;
    message = "";
    try {
      const result = await appInstallation.install();
      message =
        result === "accepted"
          ? copy(
              "Installation accepted. You can continue below.",
              "Installazione accettata. Puoi continuare qui sotto.",
            )
          : copy(
              "No problem. You can install later from your browser menu.",
              "Nessun problema. Potrai installare l’app in seguito dal menu del browser.",
            );
    } catch {
      message = copy(
        "Installation could not be started. Use your browser’s Install app or Add to Home Screen menu.",
        "Impossibile avviare l’installazione. Usa Installa app o Aggiungi alla schermata Home nel menu del browser.",
      );
    } finally {
      busy = false;
    }
  }
  async function enable() {
    busy = true;
    message = "";
    try {
      // Request browser permission only in direct response to this button click.
      await onenablepush();
      enabled = true;
      message = copy(
        "Notifications are ready on this device.",
        "Le notifiche sono pronte su questo dispositivo.",
      );
    } catch {
      const denied =
        typeof Notification !== "undefined" &&
        Notification.permission === "denied";
      message = denied
        ? copy(
            "Notifications are blocked. You can allow them in your browser’s site settings later. The activity feed still works.",
            "Le notifiche sono bloccate. Potrai consentirle dalle impostazioni del sito nel browser. Il registro attività continua a funzionare.",
          )
        : copy(
            "Notifications were not enabled. You can retry or continue and enable them later in Settings. The activity feed still works.",
            "Le notifiche non sono state attivate. Puoi riprovare oppure continuare e attivarle in seguito nelle Impostazioni. Il registro attività continua a funzionare.",
          );
    } finally {
      busy = false;
    }
  }
  async function next() {
    busy = true;
    try {
      await oncontinue();
    } catch {
      message = copy(
        "Could not save your progress. Check your connection and try again, or skip the tour.",
        "Impossibile salvare i progressi. Controlla la connessione e riprova, oppure salta il tour.",
      );
    } finally {
      busy = false;
    }
  }
</script>

<Card.Root
  class="relative z-[41] mx-auto mb-6 max-w-[680px]"
  role="region"
  data-tour={stage === "install" ? "install-app" : "enable-notifications"}
  aria-label={stage === "install"
    ? copy("Install the host app", "Installa l’app host")
    : copy("Set up notifications", "Configura le notifiche")}
  ><Card.Content
    ><div class="device-setup">
      <div class="device-icon" aria-hidden="true">
        {#if stage === "install"}<Smartphone size={24} />{:else}<Bell
            size={24}
          />{/if}
      </div>
      {#if stage === "install"}
        <h2>
          {copy("Keep guestin one tap away", "guestin sempre a portata di tocco")}
        </h2>
        <p>
          {copy(
            "Add the host app to your Home Screen for quick access to your doors, codes and activity. Installation is optional.",
            "Aggiungi l’app host alla schermata Home per accedere rapidamente a porte, codici e attività. L’installazione è facoltativa.",
          )}
        </p>
        {#if appInstallation.installed}
          <p class="device-success">
            <Check size={17} />{copy(
              "You’re already using the installed app.",
              "Stai già usando l’app installata.",
            )}
          </p>
        {:else if !appInstallation.secure}
          <p>
            {copy(
              "Open guestin using its HTTPS address to install it. You can continue the tour now and install later.",
              "Apri guestin dal suo indirizzo HTTPS per installarlo. Puoi continuare il tour e installarlo in seguito.",
            )}
          </p>
        {:else if appInstallation.ios}
          <ol>
            <li>
              {copy(
                "Open this page in Safari and tap Share.",
                "Apri questa pagina in Safari e tocca Condividi.",
              )}
            </li>
            <li>
              {copy(
                "Choose Add to Home Screen, then Add.",
                "Scegli Aggiungi alla schermata Home, poi Aggiungi.",
              )}
            </li>
            <li>
              {copy(
                "Open guestin from its new icon and sign in. Your tour continues here.",
                "Apri guestin dalla nuova icona e accedi. Il tour riprenderà da qui.",
              )}
            </li>
          </ol>
        {:else if appInstallation.prompt}
          <Button disabled={busy} onclick={install}
            ><Download size={17} />{copy(
              "Install host app",
              "Installa l’app host",
            )}</Button
          >
        {:else}
          <p>
            {copy(
              "Open your browser menu and choose Install app or Add to Home Screen. If that option isn’t available, use a supported browser such as Chrome or Edge, or continue in this browser.",
              "Apri il menu del browser e scegli Installa app o Aggiungi alla schermata Home. Se l’opzione non compare, usa un browser compatibile come Chrome o Edge, oppure continua nel browser.",
            )}
          </p>
        {/if}
      {:else}
        <h2>
          {copy(
            "Stay informed about guest activity",
            "Resta aggiornato sulle attività degli ospiti",
          )}
        </h2>
        <p>
          {copy(
            "Receive updates about access requests, device problems and breakfast usage. Choose whether this device can notify you; you can change the event filters later in Settings.",
            "Ricevi aggiornamenti su richieste di accesso, problemi ai dispositivi e utilizzo delle colazioni. Scegli se ricevere notifiche su questo dispositivo; potrai modificare i filtri nelle Impostazioni.",
          )}
        </p>
        {#if !appInstallation.secure}
          <p>
            {copy(
              "Notifications require HTTPS. You can continue now and enable them from Settings after opening the secure address.",
              "Le notifiche richiedono HTTPS. Puoi continuare e attivarle dalle Impostazioni dopo aver aperto l’indirizzo sicuro.",
            )}
          </p>
        {:else if appInstallation.ios && !appInstallation.installed}
          <p>
            {copy(
              "On iPhone and iPad, open guestin from its Home Screen icon before enabling notifications. You can finish the tour now and enable them later in Settings.",
              "Su iPhone e iPad, apri guestin dall’icona nella schermata Home prima di attivare le notifiche. Puoi terminare il tour e attivarle in seguito nelle Impostazioni.",
            )}
          </p>
        {:else if !pushSupported}
          <p>
            {copy(
              "This browser doesn’t support push notifications. The activity feed is always available in the app.",
              "Questo browser non supporta le notifiche push. Il registro attività resta disponibile nell’app.",
            )}
          </p>
        {:else if enabled}
          <p class="device-success">
            <Check size={17} />{copy(
              "Notifications enabled",
              "Notifiche attivate",
            )}
          </p>
        {:else}
          <Button disabled={busy} onclick={enable}
            ><Bell size={17} />{copy(
              "Enable notifications",
              "Attiva le notifiche",
            )}</Button
          >
        {/if}
      {/if}
      {#if message}<p role="status" class="device-message">{message}</p>{/if}
      <div class="device-actions">
        <Button variant="outline" disabled={busy} onclick={next}
          >{copy("Continue", "Continua")}</Button
        ><span
          >{copy(
            "You can also skip the whole tour above.",
            "Puoi anche saltare l’intero tour qui sopra.",
          )}</span
        >
      </div>
    </div></Card.Content
  ></Card.Root
>

<style>
  .device-setup {
    padding: 4px;
  }
  .device-icon {
    display: inline-flex;
    padding: 12px;
    background: var(--muted);
    border-radius: 12px;
    margin-bottom: 16px;
  }
  h2 {
    font-size: 20px;
    line-height: 1.3;
    margin: 0 0 10px;
    font-weight: 600;
  }
  p,
  li {
    color: var(--muted-foreground);
    font-size: 14px;
    line-height: 1.65;
  }
  p {
    margin: 0 0 16px;
  }
  ol {
    padding-left: 22px;
    margin-bottom: 20px;
  }
  .device-success {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--foreground);
  }
  .device-message {
    margin-top: 16px;
    padding: 12px;
    background: var(--muted);
    border-radius: 8px;
  }
  .device-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }
  .device-actions span {
    color: var(--muted-foreground);
    font-size: 12px;
  }
</style>
