<script lang="ts">
  import FeedbackToast from "$lib/components/FeedbackToast.svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Download, Upload, ShieldAlert } from "@lucide/svelte";
  import { hostLanguage } from "$lib/i18n.svelte";
  import {
    backupSchema,
    MAX_BACKUP_BYTES,
    type PortableBackup,
  } from "../../../../../shared/backup";
  let {
    api,
    reload,
  }: {
    api: (path: string, body?: any, method?: string) => Promise<any>;
    reload: () => Promise<void>;
  } = $props();
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  let backup = $state<PortableBackup | null>(null),
    fileName = $state(""),
    busy = $state(false),
    reading = $state(false),
    error = $state(""),
    notice = $state(""),
    confirmation = $state(""),
    acknowledged = $state(false);
  let readingRequest = 0;
  let fileInput = $state<HTMLInputElement | null>(null);
  async function download() {
    if (busy) return;
    busy = true;
    error = "";
    notice = "";
    try {
      const data = await api("admin/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `guestin-${data.exportedAt.slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      notice = l(
        "JSON backup downloaded. Keep it private.",
        "Backup JSON scaricato. Conservalo in modo privato.",
      );
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function read(file?: File) {
    const ticket = ++readingRequest;
    backup = null;
    error = "";
    notice = "";
    confirmation = "";
    acknowledged = false;
    fileName = file?.name ?? "";
    reading = false;
    if (!file) return;
    reading = true;
    try {
      if (file.size > MAX_BACKUP_BYTES - 128)
        throw Error(
          l(
            "Choose a JSON backup smaller than 32 MB.",
            "Scegli un backup JSON inferiore a 32 MB.",
          ),
        );
      const data = backupSchema.parse(JSON.parse(await file.text()));
      if (ticket === readingRequest) backup = data;
    } catch {
      if (ticket === readingRequest)
        error = l(
          "This is not a valid guestin JSON backup (version 1), or it is too large. No data was changed.",
          "Questo non è un backup JSON guestin valido (versione 1), oppure è troppo grande. Nessun dato è stato modificato.",
        );
    } finally {
      if (ticket === readingRequest) reading = false;
    }
  }
  async function restore() {
    if (busy || !backup || confirmation !== "RESTORE" || !acknowledged) return;
    busy = true;
    error = "";
    notice = "";
    try {
      const result = await api("admin/import", { backup, confirmation });
      await reload();
      backup = null;
      if (fileInput) fileInput.value = "";
      confirmation = "";
      acknowledged = false;
      notice = l(
        `Restored ${result.properties} structures, ${result.doors} doors and ${result.codes} access codes. Skipped ${result.skippedProperties + result.skippedDoors + result.skippedCodes} existing items.`,
        `Ripristinate ${result.properties} strutture, ${result.doors} porte e ${result.codes} codici di accesso. Ignorati ${result.skippedProperties + result.skippedDoors + result.skippedCodes} elementi già presenti.`,
      );
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<Card.Root class="mb-6">
  <Card.Header
    ><Card.Title
      >{l("JSON backup and restore", "Backup e ripristino JSON")}</Card.Title
    ><Card.Description
      >{l(
        "Download all structures, doors and access codes, including usage, breakfast history, links and activity. Photos, user accounts and booking connector logins are not included.",
        "Scarica tutte le strutture, le porte e i codici di accesso, con utilizzi, storico colazioni, link e attività. Foto, account utenti e credenziali dei connettori prenotazioni non sono inclusi.",
      )}</Card.Description
    ></Card.Header
  >
  <Card.Content class="space-y-6">
    <div class="flex gap-3 rounded-lg bg-muted p-4 text-sm">
      <ShieldAlert class="shrink-0" size={20} />
      <p>
        {l(
          "The JSON contains working guest tokens and door credentials. Anyone with this file could access your devices. Store it securely and import only backups you trust.",
          "Il JSON contiene token ospiti e credenziali delle porte attivi. Chiunque possieda il file potrebbe accedere ai dispositivi. Conservalo al sicuro e importa solo backup fidati.",
        )}
      </p>
    </div>
    <Button variant="outline" disabled={busy || reading} onclick={download}
      ><Download size={17} />{l(
        "Download JSON backup",
        "Scarica backup JSON",
      )}</Button
    >
    <div class="space-y-2 border-t pt-5">
      <Label for="backup-file"
        >{l("Restore from JSON", "Ripristina da JSON")}</Label
      ><Input
        id="backup-file"
        bind:ref={fileInput}
        type="file"
        accept=".json,application/json"
        disabled={busy}
        onchange={(e) => void read(e.currentTarget.files?.[0])}
      />
      <p class="text-xs text-muted-foreground">
        {l(
          "Maximum 32 MB. Uploading only previews the backup; nothing is restored until you confirm.",
          "Massimo 32 MB. Il caricamento mostra solo un’anteprima: il ripristino richiede conferma.",
        )}
      </p>
    </div>
    {#if backup}<form
        class="space-y-4"
        onsubmit={(e) => {
          e.preventDefault();
          void restore();
        }}
        data-backup-preview
      >
        <div class="space-y-1 text-sm">
          <strong>{fileName}</strong>
          <p>
            {backup.properties.length}
            {l("structures", "strutture")} · {backup.doors.length}
            {l("doors", "porte")} · {backup.codes.length}
            {l("access codes", "codici di accesso")}
          </p>
          <p>
            {backup.codes.reduce(
              (sum, code) =>
                sum +
                code.redemptions.reduce((used, r) => used + r.quantity, 0),
              0,
            )}
            {l("breakfasts already used", "colazioni già utilizzate")}
          </p>
        </div>
        <p class="text-sm text-muted-foreground">
          {l(
            "Only missing records are added. Existing IDs keep their current settings, usage and revocation. Restored guest tokens stay the same; links use this server’s address. Unresolved device requests stay blocked until checked.",
            "Vengono aggiunti solo i record mancanti. Gli ID esistenti mantengono impostazioni, utilizzi e revoche attuali. I token ospiti restano gli stessi; i link usano l’indirizzo di questo server. Le richieste ai dispositivi non risolte restano bloccate fino alla verifica.",
          )}
        </p>
        <Label class="flex items-start gap-3"
          ><Switch bind:checked={acknowledged} disabled={busy} /><span
            >{l(
              "I trust this backup and want to restore its missing records.",
              "Mi fido di questo backup e voglio ripristinarne i record mancanti.",
            )}</span
          ></Label
        >
        <div class="space-y-2">
          <Label for="restore-confirmation"
            >{l(
              "Type RESTORE to confirm",
              "Scrivi RESTORE per confermare",
            )}</Label
          ><Input
            id="restore-confirmation"
            bind:value={confirmation}
            disabled={busy}
            autocomplete="off"
            pattern="RESTORE"
            required
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={busy || !acknowledged || confirmation !== "RESTORE"}
            ><Upload size={17} />{l(
              "Restore missing records",
              "Ripristina record mancanti",
            )}</Button
          ><Button
            type="button"
            variant="outline"
            disabled={busy}
            onclick={() => {
              backup = null;
              if (fileInput) fileInput.value = "";
            }}>{l("Cancel", "Annulla")}</Button
          >
        </div>
      </form>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}<FeedbackToast
      message={notice}
    />
  </Card.Content>
</Card.Root>
