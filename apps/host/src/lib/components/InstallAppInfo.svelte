<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Smartphone, Share2, EllipsisVertical } from "@lucide/svelte";
  import { hostLanguage } from "$lib/i18n.svelte";
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
</script>

<div class="mx-auto max-w-2xl space-y-5">
  <p class="text-sm text-muted-foreground">
    {l(
      "Add guestin to your Home Screen to open it like an app. Use your server’s HTTPS address in a regular browser, rather than an embedded browser inside another app.",
      "Aggiungi guestin alla schermata Home per aprirlo come un’app. Usa l’indirizzo HTTPS del tuo server in un browser normale, anziché nel browser interno di un’altra app.",
    )}
  </p>
  <Card.Root
    ><Card.Header
      ><Card.Title class="flex items-center gap-2"
        ><Smartphone size={20} />iPhone / iPad</Card.Title
      ></Card.Header
    ><Card.Content
      ><ol class="list-decimal space-y-3 pl-5 text-sm">
        <li>
          {l(
            "Open this host app in Safari.",
            "Apri questa app host in Safari.",
          )}
        </li>
        <li>
          <Share2 size={15} class="mr-1 inline" />{l(
            "Open Share, then choose Add to Home Screen. You may need to scroll down or open More.",
            "Apri Condividi, poi scegli Aggiungi alla schermata Home. Potrebbe essere necessario scorrere o aprire Altro.",
          )}
        </li>
        <li>
          {l(
            "If shown, enable Open as Web App, then tap Add.",
            "Se disponibile, attiva Apri come app web, poi tocca Aggiungi.",
          )}
        </li>
        <li>
          {l(
            "Launch guestin from the new Home Screen icon.",
            "Avvia guestin dalla nuova icona nella schermata Home.",
          )}
        </li>
      </ol></Card.Content
    ></Card.Root
  >
  <Card.Root
    ><Card.Header
      ><Card.Title class="flex items-center gap-2"
        ><Smartphone size={20} />Android</Card.Title
      ></Card.Header
    ><Card.Content
      ><ol class="list-decimal space-y-3 pl-5 text-sm">
        <li>
          {l(
            "Open this host app in Chrome.",
            "Apri questa app host in Chrome.",
          )}
        </li>
        <li>
          <EllipsisVertical size={15} class="mr-1 inline" />{l(
            "Open the browser menu, then Install app or Install and create shortcut → Install. On some versions it is called Add to Home screen.",
            "Apri il menu del browser, poi Installa app oppure Installa e crea scorciatoia → Installa. In alcune versioni si chiama Aggiungi a schermata Home.",
          )}
        </li>
        <li>
          {l(
            "Confirm installation and open guestin from its new icon.",
            "Conferma l’installazione e apri guestin dalla nuova icona.",
          )}
        </li>
      </ol></Card.Content
    ></Card.Root
  >
  <p class="text-sm text-muted-foreground">
    {l(
      "You can manage push notifications separately in Settings → Notifications. Door opening and breakfast redemption still need an internet connection.",
      "Puoi gestire le notifiche push separatamente in Impostazioni → Notifiche. L’apertura delle porte e l’utilizzo delle colazioni richiedono una connessione Internet.",
    )}
  </p>
</div>
