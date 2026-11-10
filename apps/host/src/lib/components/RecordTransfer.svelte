<script lang="ts">
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { Download, Upload, ShieldAlert } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import Modal from "$lib/components/Modal.svelte";
  import FeedbackToast from "$lib/components/FeedbackToast.svelte";
  import { hostLanguage } from "$lib/i18n.svelte";
  import { MAX_BACKUP_BYTES } from "../../../../../shared/backup";
  import {
    recordTransferSchema,
    replacementConfirmation,
    type RecordTransfer,
    type RecordKind,
  } from "../../../../../shared/record-transfer";
  let {
    kind,
    open = $bindable(false),
    showTrigger = true,
    propertyId,
    propertyName,
    api,
    reload,
  }: {
    kind: RecordKind;
    open?: boolean;
    showTrigger?: boolean;
    propertyId: string;
    propertyName: string;
    api: (path: string, body?: any, method?: string) => Promise<any>;
    reload: () => Promise<void>;
  } = $props();
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  let busy = $state(false),
    reading = $state(false),
    data = $state<RecordTransfer | null>(null),
    name = $state(""),
    replace = $state(false),
    acknowledged = $state(false),
    confirmation = $state(""),
    error = $state(""),
    notice = $state("");
  let fileInput = $state<HTMLInputElement | null>(null),
    operation = 0;
  const required = $derived(replacementConfirmation(kind));
  const title = $derived(
    kind === "doors"
      ? l("Doors JSON", "JSON porte")
      : l("Access codes JSON", "JSON codici di accesso"),
  );
  const items = $derived(
    data?.format === "guestin-doors"
      ? data.doors.map((d) => ({ id: d.id, label: d.data.name }))
      : data?.format === "guestin-codes"
        ? data.codes.map((c) => ({ id: c.id, label: c.data.label }))
        : [],
  );
  const warning = $derived(
    kind === "doors"
      ? l(
          "This replaces every door in this structure, including disabled doors. Doors omitted from the file are deleted and removed from existing access-code permissions. Matching door configurations and photos are overwritten. Existing access codes and their usage remain. This cannot be undone without a backup.",
          "Sostituisce tutte le porte della struttura, incluse quelle disabilitate. Le porte assenti dal file vengono eliminate e rimosse dai permessi dei codici esistenti. Configurazioni e foto delle porte corrispondenti vengono sovrascritte. I codici esistenti e gli utilizzi restano. L’operazione è irreversibile senza backup.",
        )
      : l(
          "This permanently replaces every access code in this structure, including guest, staff and revoked codes, with the file contents. Current usage and notification history are removed; the file’s saved guest tokens, usage and revocation state take their place. An older file can reactivate revoked codes or reset consumed access. Links absent from the file stop working. This cannot be undone without a backup.",
          "Sostituisce definitivamente tutti i codici della struttura, inclusi ospiti, staff e revocati, con il contenuto del file. Gli utilizzi e la cronologia attuali vengono rimossi e sostituiti dai token ospiti e dallo stato salvato nel file. Un file precedente può riattivare codici revocati o azzerare accessi consumati. I link assenti dal file smettono di funzionare. L’operazione è irreversibile senza backup.",
        ),
  );
  $effect(() => {
    const id = propertyId;
    untrack(() => {
      id;
      operation++;
      open = false;
      data = null;
      name = "";
      replace = false;
      acknowledged = false;
      confirmation = "";
      busy = false;
      reading = false;
      error = "";
    });
  });
  async function download() {
    const ticket = ++operation,
      id = propertyId;
    busy = true;
    error = "";
    try {
      const document = await api(
        `admin/records/${kind}/export?propertyId=${encodeURIComponent(id)}`,
      );
      if (ticket !== operation) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(document, null, 2)], {
          type: "application/json",
        }),
      );
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `guestin-${kind}-${propertyName.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 60)}-${document.exportedAt.slice(0, 10)}.json`;
      window.document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      notice = l(
        "JSON downloaded. Keep it private.",
        "JSON scaricato. Conservalo in modo privato.",
      );
    } catch (e: any) {
      if (ticket === operation) error = e.message;
    } finally {
      if (ticket === operation) busy = false;
    }
  }
  async function read(file?: File) {
    toast.dismiss();
    notice = "";
    const ticket = ++operation;
    data = null;
    name = file?.name ?? "";
    error = "";
    replace = false;
    acknowledged = false;
    confirmation = "";
    reading = !!file;
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES - 1024)
        throw Error(
          l(
            "Choose a JSON file smaller than 32 MB",
            "Scegli un file JSON inferiore a 32 MB",
          ),
        );
      const parsed = recordTransferSchema.parse(JSON.parse(await file.text()));
      if (
        parsed.format !== (kind === "doors" ? "guestin-doors" : "guestin-codes")
      )
        throw Error(
          l(
            "Choose a JSON file for this list",
            "Scegli un file JSON per questo elenco",
          ),
        );
      if (ticket === operation) data = parsed;
    } catch (e: any) {
      if (ticket === operation)
        error = l(
          "Invalid JSON file. No data was changed.",
          "File JSON non valido. Nessun dato modificato.",
        );
    } finally {
      if (ticket === operation) reading = false;
    }
  }
  async function upload() {
    if (
      !data ||
      busy ||
      (replace && (!acknowledged || confirmation !== required))
    )
      return;
    const ticket = ++operation,
      id = propertyId;
    busy = true;
    error = "";
    try {
      const result = await api(`admin/records/${kind}/import`, {
        propertyId: id,
        mode: replace ? "replace" : "append",
        ...(replace ? { confirmation } : {}),
        data,
      });
      await reload();
      if (ticket !== operation) return;
      notice = l(
        `Added ${result.added}, replaced ${result.replaced}, removed ${result.removed}, skipped ${result.skipped}.`,
        `Aggiunti ${result.added}, sostituiti ${result.replaced}, rimossi ${result.removed}, ignorati ${result.skipped}.`,
      );
      data = null;
      confirmation = "";
      acknowledged = false;
      if (fileInput) fileInput.value = "";
      open = false;
    } catch (e: any) {
      if (ticket === operation) error = e.message;
    } finally {
      if (ticket === operation) busy = false;
    }
  }
</script>

{#if showTrigger}<Button
    type="button"
    variant="outline"
    disabled={!propertyId}
    onclick={() => {
      toast.dismiss();
      notice = "";
      open = true;
    }}
    data-record-transfer={kind}
    ><Download size={16} /><Upload size={16} />{title}</Button
  >{/if}
<FeedbackToast message={notice} />
<Modal
  {open}
  {title}
  onclose={() => {
    if (!busy && !reading) open = false;
  }}
  ><div class="stack">
    <p><strong>{propertyName}</strong></p>
    <p class="muted">
      {kind === "doors"
        ? l(
            "All doors in this structure, including disabled doors, photos and webhook credentials.",
            "Tutte le porte della struttura, incluse porte disabilitate, foto e credenziali webhook.",
          )
        : l(
            "All access codes in this structure, including guest, staff and revoked codes, permissions, usage and activity. Calendar and search filters do not limit the file.",
            "Tutti i codici della struttura, inclusi ospiti, staff e revocati, permessi, utilizzi e attività. Calendario e ricerca non limitano il file.",
          )}
    </p>
    <div class="flex gap-3 rounded-lg bg-muted p-3 text-sm">
      <ShieldAlert size={21} class="shrink-0" />
      <p>
        {l(
          "These files contain working door credentials or guest links. Keep them private and import only files you trust.",
          "I file contengono credenziali delle porte o link ospiti attivi. Conservali privatamente e importa solo file fidati.",
        )}
      </p>
    </div>
    <Button
      type="button"
      variant="outline"
      disabled={busy || reading}
      onclick={download}
      ><Download size={16} />{l("Download JSON", "Scarica JSON")}</Button
    >
    <Label class="field-label" for={`records-${kind}-file`}
      >{l("Upload JSON", "Carica JSON")}<Input
        id={`records-${kind}-file`}
        type="file"
        accept=".json,application/json"
        disabled={busy || reading}
        bind:ref={fileInput}
        onchange={(e) => read(e.currentTarget.files?.[0])}
      /></Label
    >
    <small
      >{l(
        "Maximum 32 MB. Uploading only previews the file; nothing changes until you import.",
        "Massimo 32 MB. Il caricamento mostra solo un’anteprima: nessuna modifica fino all’importazione.",
      )}</small
    >
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if data}<form
        class="stack"
        onsubmit={(e) => {
          e.preventDefault();
          void upload();
        }}
        data-record-preview={kind}
      >
        <strong>{name}</strong>
        <p>
          {items.length}
          {kind === "doors"
            ? l("doors", "porte")
            : l("access codes", "codici di accesso")}
        </p>
        <ul class="list-inside list-disc text-sm">
          {#each items.slice(0, 5) as item (item.id)}<li>
              {item.label}
            </li>{/each}
        </ul>
        <Label class="inline" for={`records-${kind}-replace`}
          ><Switch
            id={`records-${kind}-replace`}
            checked={replace}
            disabled={busy}
            onCheckedChange={(value) => {
              toast.dismiss();
              replace = value;
              acknowledged = false;
              confirmation = "";
            }}
          />{l("Override current list", "Sovrascrivi elenco attuale")}</Label
        >
        {#if replace}<div
            class="stack rounded-lg border border-destructive/50 bg-destructive/5 p-4"
            role="alert"
          >
            <strong
              >{l("Replace entire list", "Sostituisci intero elenco")}</strong
            >
            <p>{warning}</p>
          </div>
          <Label class="inline" for={`records-${kind}-acknowledge`}
            ><Switch
              id={`records-${kind}-acknowledge`}
              bind:checked={acknowledged}
              disabled={busy}
            />{l(
              "I understand the entire current list will be replaced",
              "Comprendo che l’intero elenco attuale verrà sostituito",
            )}</Label
          >
          <Label class="field-label" for={`records-${kind}-confirmation`}
            >{l("Type to confirm", "Digita per confermare")}: {required}<Input
              id={`records-${kind}-confirmation`}
              bind:value={confirmation}
              autocomplete="off"
              disabled={busy}
            /></Label
          >
        {:else}<p class="muted">
            {l(
              "Append mode adds missing IDs. Existing records are skipped and keep their current state. Unrelated structures are never changed.",
              "La modalità aggiungi importa solo gli ID mancanti. I record esistenti mantengono il loro stato. Le altre strutture non vengono modificate.",
            )}
          </p>{/if}
        {#if kind === "codes"}<p class="muted">
            {l(
              "Referenced door IDs must already exist in this structure. Import the doors JSON first when moving to a new installation.",
              "Gli ID delle porte devono già esistere nella struttura. Importa prima il JSON delle porte quando trasferisci su una nuova installazione.",
            )}
          </p>{/if}
        <Button
          type="submit"
          variant={replace ? "destructive" : "default"}
          disabled={busy ||
            reading ||
            (replace && (!acknowledged || confirmation !== required))}
          ><Upload size={16} />{replace
            ? l("Replace list", "Sostituisci elenco")
            : l("Append records", "Aggiungi record")}</Button
        >
      </form>{/if}
  </div></Modal
>
