<script lang="ts">
  import { randomUUID } from "$lib/browser";
  import {
    DoorOpen,
    Plus,
    ArrowUp,
    ArrowDown,
    GripVertical,
    ChevronRight,
    CircleAlert,
  } from "@lucide/svelte";
  import { hostLanguage, t } from "$lib/i18n.svelte";
  type Photo = { id: string; url: string; alt: string };
  type Door = {
    id: string;
    propertyId: string;
    name: string;
    integration: string;
    common?: boolean;
    singleUse?: boolean;
    enabled?: boolean;
    description?: string;
    translations?: Record<string, string>;
    descriptionTranslations?: Record<string, string>;
    photos?: Photo[];
    primaryPhotoId?: string | null;
    order?: number;
    testAction?: { id: string; status: string; detail: string } | null;
  };
  let {
    doors,
    propertyId,
    propertyName = "",
    owner,
    api,
    reload,
    onSaved,
    onSetup,
    editor = $bindable(false),
    editId = $bindable(""),
    detailId = $bindable(""),
  }: {
    doors: Door[];
    propertyId: string;
    propertyName?: string;
    owner: boolean;
    api: (
      path: string,
      body?: any,
      method?: string,
      headers?: Record<string, string>,
    ) => Promise<any>;
    reload: () => Promise<void>;
    onSaved: (id: string) => void;
    onSetup: () => void;
    editor?: boolean;
    editId?: string;
    detailId?: string;
  } = $props();
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  let filter = $state("all"),
    pending = $state(false),
    error = $state(""),
    message = $state("");
  let draft = $state({
    name: "",
    integration: "none",
    common: false,
    singleUse: false,
    enabled: true,
    description: "",
    translations: {} as Record<string, string>,
    descriptionTranslations: {} as Record<string, string>,
    photos: [] as Photo[],
    primaryPhotoId: null as string | null,
    order: 0,
  });
  let webhook = $state(""),
    cloudHost = $state(""),
    deviceId = $state(""),
    apiKey = $state("");
  let loadedKey = "",
    orderIds = $state<string[] | null>(null),
    dragged = $state("");
  let confirmation = $state<{
      kind: "test" | "delete" | "resolve";
      door: Door;
    } | null>(null),
    acknowledged = $state(false);
  let result = $state<{ status: string; detail: string } | null>(null),
    selectedPhoto = $state("");
  const localDoors = $derived(
    doors
      .filter((d) => d.propertyId === propertyId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  );
  const orderedDoors = $derived(
    orderIds
      ? orderIds
          .map((id) => localDoors.find((d) => d.id === id))
          .filter((d): d is Door => !!d)
      : localDoors,
  );
  const visibleDoors = $derived(
    orderedDoors.filter(
      (d) =>
        filter === "all" ||
        (filter === "enabled" ? d.enabled !== false : d.enabled === false),
    ),
  );
  const detail = $derived(localDoors.find((d) => d.id === detailId));
  let lastProperty = "";
  $effect(() => {
    if (lastProperty !== propertyId) {
      lastProperty = propertyId;
      orderIds = null;
      dragged = "";
      confirmation = null;
      result = null;
      selectedPhoto = "";
      filter = "all";
    }
  });
  $effect(() => {
    const key = editor ? `${propertyId}/${editId}` : "";
    const source = editId
      ? doors.find((d) => d.id === editId && d.propertyId === propertyId)
      : undefined;
    if (editor && (!editId || source) && loadedKey !== key) {
      draft = {
        name: source?.name ?? "",
        integration: source?.integration ?? "none",
        common: source?.common ?? false,
        singleUse: source?.singleUse ?? false,
        enabled: source?.enabled ?? true,
        description: source?.description ?? "",
        translations: { ...source?.translations },
        descriptionTranslations: { ...source?.descriptionTranslations },
        photos: (source?.photos ?? []).map((p) => ({ ...p })),
        primaryPhotoId: source?.primaryPhotoId ?? null,
        order: source?.order ?? localDoors.length,
      };
      webhook = "";
      cloudHost = "";
      deviceId = "";
      apiKey = "";
      error = "";
      message = "";
      loadedKey = key;
    }
    if (!editor) loadedKey = "";
  });
  async function run(fn: () => Promise<void>) {
    if (pending) return;
    pending = true;
    error = "";
    message = "";
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      pending = false;
    }
  }
  function addDoor() {
    editId = "";
    detailId = "";
    editor = true;
    confirmation = null;
    result = null;
  }
  function editDoor(d: Door) {
    editId = d.id;
    editor = true;
    confirmation = null;
  }
  function back() {
    editor = false;
    editId = "";
    detailId = "";
    confirmation = null;
    result = null;
  }
  function ask(kind: "test" | "delete" | "resolve", door: Door) {
    confirmation = { kind, door };
    acknowledged = false;
    result = null;
    error = "";
  }
  async function save() {
    const config =
      draft.integration === "none"
        ? {}
        : draft.integration === "ewelink"
          ? webhook
            ? { webhook_code: webhook }
            : {}
          : cloudHost || deviceId || apiKey
            ? { host: cloudHost, device_id: deviceId, api_key: apiKey }
            : {};
    const saved = await api(
      "doors" + (editId ? "/" + editId : ""),
      { ...draft, propertyId, config },
      editId ? "PUT" : "POST",
    );
    const id = saved.id ?? editId;
    await reload();
    editor = false;
    editId = "";
    detailId = "";
    onSaved(id);
    message = l("Door saved.", "Porta salvata.");
  }
  function move(id: string, delta: number) {
    const ids = [...(orderIds ?? localDoors.map((d) => d.id))];
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    orderIds = ids;
  }
  function drop(id: string) {
    if (!dragged || dragged === id) return;
    const ids = [...(orderIds ?? localDoors.map((d) => d.id))];
    const from = ids.indexOf(dragged);
    const to = ids.indexOf(id);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragged);
    orderIds = ids;
    dragged = "";
  }
  async function saveOrder() {
    await api("doors/order", { propertyId, doorIds: orderIds }, "PUT");
    await reload();
    orderIds = null;
    message = l("Door order saved.", "Ordine porte salvato.");
  }
  async function confirmAction() {
    if (!confirmation || !acknowledged) return;
    const { kind, door } = confirmation;
    if (kind === "delete") {
      await api("doors/" + door.id, undefined, "DELETE");
      await reload();
      back();
      message = l("Door deleted.", "Porta eliminata.");
    } else if (kind === "resolve") {
      await api("doors/" + door.id + "/resolve-test", {
        actionId: door.testAction?.id,
        confirm: true,
      });
      await reload();
      confirmation = null;
      message = l(
        "Uncertain test marked as checked. A new test can now be requested.",
        "Test incerto segnato come verificato. Ora puoi richiedere un nuovo test.",
      );
    } else {
      confirmation = null;
      try {
        result = await api(
          "doors/" + door.id + "/test",
          { confirm: true },
          "POST",
          { "Idempotency-Key": randomUUID() },
        );
      } catch (e) {
        result = {
          status: "uncertain",
          detail: l(
            "The response could not be confirmed. Do not repeat the request until you have checked the door.",
            "Non è stato possibile confermare la risposta. Non ripetere la richiesta prima di aver controllato la porta.",
          ),
        };
        throw e;
      } finally {
        await reload();
      }
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (draft.photos.length + files.length > 4)
      throw Error(
        l(
          "Choose up to four photos per door.",
          "Scegli fino a quattro foto per porta.",
        ),
      );
    for (const file of Array.from(files)) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 15 * 1024 * 1024
      )
        throw Error(
          l(
            "Use a JPEG, PNG or WebP image smaller than 15 MB.",
            "Usa un’immagine JPEG, PNG o WebP inferiore a 15 MB.",
          ),
        );
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        throw Error("Image processing is unavailable.");
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      let url = canvas.toDataURL("image/jpeg", 0.82);
      for (
        let quality = 0.7;
        url.length > 400000 && quality >= 0.3;
        quality -= 0.1
      )
        url = canvas.toDataURL("image/jpeg", quality);
      if (url.length > 400000)
        throw Error(
          l(
            "This photo is too detailed. Choose a smaller image.",
            "Questa foto è troppo dettagliata. Scegli un’immagine più piccola.",
          ),
        );
      const photo = {
        id: randomUUID(),
        url,
        alt: draft.name || file.name,
      };
      draft.photos = [...draft.photos, photo];
      draft.primaryPhotoId ??= photo.id;
    }
  }
  function removePhoto(id: string) {
    draft.photos = draft.photos.filter((p) => p.id !== id);
    if (draft.primaryPhotoId === id)
      draft.primaryPhotoId = draft.photos[0]?.id ?? null;
  }
  function primary(d: Door) {
    return d.photos?.find((p) => p.id === d.primaryPhotoId) ?? d.photos?.[0];
  }
</script>

<section aria-label={t("Doors")}>
  {#if !editor && !detailId}<div class="row spread section-intro">
      <div>
        <p class="muted">{t("The doors your guests can use.")}</p>
        <small
          >{localDoors.length}
          {t("doors in")}
          {propertyName || t("your property")}</small
        >
      </div>
      {#if owner && !editor}<button
          data-tour="add-door"
          class="primary"
          disabled={!propertyId || pending}
          onclick={addDoor}><Plus size={16} />{t("Add door")}</button
        >{/if}
    </div>{/if}
  {#if error}<p role="alert" class="error">{error}</p>{/if}
  {#if message}<p role="status" class="notice">{message}</p>{/if}
  {#if result}<div class="card" role="status">
      <strong
        >{result.status === "accepted"
          ? l(
              "Request accepted by device provider",
              "Richiesta accettata dal fornitore",
            )
          : result.status === "failed"
            ? l("Device request failed", "Richiesta al dispositivo fallita")
            : l(
                "Uncertain result — check the door",
                "Risultato incerto — controlla la porta",
              )}</strong
      >
      <p>{result.detail}</p>
      <p>
        {l(
          "Provider acceptance does not prove that the door physically opened. No automatic retry is sent.",
          "L’accettazione del fornitore non prova che la porta si sia aperta fisicamente. Non viene eseguito alcun tentativo automatico.",
        )}
      </p>
    </div>{/if}
  {#if confirmation}
    <section
      class="card confirmation stack"
      aria-label={l("Confirm door action", "Conferma azione porta")}
    >
      <h2>
        {confirmation.kind === "test"
          ? l("Test opening", "Prova apertura")
          : confirmation.kind === "delete"
            ? l("Delete door", "Elimina porta")
            : l("Resolve uncertain test", "Risolvi test incerto")}: {confirmation
          .door.name}
      </h2>
      <p>
        {confirmation.kind === "test"
          ? l(
              "This sends a real unlock request to the connected device. Make sure it is safe to open the door and someone can verify the result. No guest code is consumed.",
              "Verrà inviata una vera richiesta di apertura al dispositivo collegato. Assicurati che sia sicuro aprire la porta e che qualcuno possa verificare il risultato. Nessun codice ospite verrà consumato.",
            )
          : confirmation.kind === "delete"
            ? l(
                "This permanently deletes the door and its photos and connection credentials. Doors referenced by access codes cannot be deleted; disable them instead.",
                "La porta, le sue foto e le credenziali di connessione verranno eliminate definitivamente. Le porte associate a codici di accesso non possono essere eliminate; disabilitale invece.",
              )
            : l(
                "Only continue after physically checking the door and verifying the previous request. This clears the uncertain state; it does not send another unlock request.",
                "Continua solo dopo aver controllato fisicamente la porta e verificato la richiesta precedente. Questo rimuove lo stato incerto e non invia un’altra richiesta di apertura.",
              )}
      </p>
      <label class="inline"
        ><input type="checkbox" bind:checked={acknowledged} />{l(
          "I understand and confirm",
          "Ho compreso e confermo",
        )}</label
      >
      <div class="row">
        <button
          disabled={!acknowledged || pending}
          onclick={() => run(confirmAction)}
          >{confirmation.kind === "test"
            ? l("Send unlock request", "Invia richiesta di apertura")
            : l("Confirm", "Conferma")}</button
        ><button disabled={pending} onclick={() => (confirmation = null)}
          >{t("Cancel")}</button
        >
      </div>
    </section>
  {/if}
  {#if !propertyId}
    <div class="card empty-state">
      <DoorOpen size={36} />
      <h2>{t("Add your property first")}</h2>
      <p>{t("Then connect the doors guests will access.")}</p>
      {#if owner}<button onclick={onSetup}>{t("Set up a property")}</button
        >{:else}<p>
          {t("Ask an owner to set up a property and its doors.")}
        </p>{/if}
    </div>
  {:else if editor && owner}
    {#if editId && !localDoors.some((d) => d.id === editId)}<div class="card">
        <p>
          {l(
            "This door is not available in the selected property.",
            "Questa porta non è disponibile nella struttura selezionata.",
          )}
        </p>
        <button onclick={back}>{t("Back to doors")}</button>
      </div>
    {:else}
      <form
        data-tour="door-form"
        class="card stack"
        onsubmit={(e) => {
          e.preventDefault();
          void run(save);
        }}
      >
        <div class="row spread">
          <h2>{t(editId ? "Edit door" : "Add door")}</h2>
          <button type="button" disabled={pending} onclick={back}
            >{t("Back to doors")}</button
          >
        </div>
        <div class="grid">
          <label
            >{t("Name")}<input
              bind:value={draft.name}
              required
              maxlength="120"
            /></label
          ><label
            >{t("Integration")}<select bind:value={draft.integration}
              ><option value="none">{t("Connect later (example door)")}</option
              ><option value="ewelink">eWeLink webhook</option><option
                value="shelly">Shelly Cloud</option
              ></select
            ></label
          >
        </div>
        <label
          >{l("Description", "Descrizione")}<textarea
            bind:value={draft.description}
            maxlength="3000"
            placeholder={l(
              "Help guests locate and use this door",
              "Aiuta gli ospiti a trovare e usare questa porta",
            )}></textarea></label
        >
        <div class="row">
          <label class="inline"
            ><input type="checkbox" bind:checked={draft.enabled} />{l(
              "Enabled for guest access",
              "Abilitata per l’accesso ospiti",
            )}</label
          ><label class="inline"
            ><input type="checkbox" bind:checked={draft.common} />{t(
              "Common door · preselected",
            )}</label
          ><label class="inline"
            ><input type="checkbox" bind:checked={draft.singleUse} />{t(
              "Single use by default",
            )}</label
          >
        </div>
        <small
          >{l(
            "Disabling a door blocks guest requests while preserving its connection and access permissions.",
            "Disabilitare una porta blocca le richieste degli ospiti mantenendo la connessione e i permessi di accesso.",
          )}</small
        >
        {#if draft.integration === "ewelink"}<label
            >{t("eWeLink webhook code")}<input
              type="password"
              bind:value={webhook}
              autocomplete="off"
              required={!editId}
            /></label
          >
        {:else if draft.integration === "shelly"}<div class="grid">
            <label
              >{t("Shelly Cloud host")}<input
                bind:value={cloudHost}
                placeholder="shelly-196-eu.shelly.cloud"
                required={!editId}
              /></label
            ><label
              >{t("Device ID")}<input
                bind:value={deviceId}
                required={!editId}
              /></label
            ><label
              >{t("API key")}<input
                type="password"
                bind:value={apiKey}
                autocomplete="off"
                required={!editId}
              /></label
            >
          </div>{/if}
        {#if draft.integration === "none"}<p class="notice">
            {t(
              "This is an example door. You will add a device connector later. No unlock request can be sent until it is connected.",
            )}
          </p>{:else if editId}<small
            >{t(
              "Leave credentials empty when editing to keep existing values.",
            )}</small
          >{/if}
        <details>
          <summary
            >{l(
              "Translated names and descriptions (optional)",
              "Nomi e descrizioni tradotti (facoltativi)",
            )}</summary
          >
          <div class="stack">
            {#each ["en", "it", "fr", "es", "de"] as lang (lang)}<div
                class="grid"
              >
                <label
                  >{lang.toUpperCase()} · {t("Name")}<input
                    bind:value={draft.translations[lang]}
                    placeholder={draft.name}
                    maxlength="120"
                  /></label
                ><label
                  >{lang.toUpperCase()} · {l(
                    "Description",
                    "Descrizione",
                  )}<textarea
                    bind:value={draft.descriptionTranslations[lang]}
                    placeholder={draft.description}
                    maxlength="3000"></textarea></label
                >
              </div>{/each}
          </div>
        </details>
        <fieldset class="stack">
          <legend>{l("Door photos", "Foto della porta")}</legend><label
            >{l("Add photos (up to 4)", "Aggiungi foto (fino a 4)")}<input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={pending || draft.photos.length >= 4}
              onchange={(e) => {
                const input = e.currentTarget;
                void run(async () => {
                  await upload(input.files);
                  input.value = "";
                });
              }}
            /></label
          ><small
            >{l(
              "Photos are resized in your browser and saved with the door.",
              "Le foto vengono ridimensionate nel browser e salvate insieme alla porta.",
            )}</small
          >
          <div class="photo-grid">
            {#each draft.photos as photo (photo.id)}<div class="photo-card">
                <img src={photo.url} alt={photo.alt} /><label
                  >{l("Photo description", "Descrizione foto")}<input
                    bind:value={photo.alt}
                    maxlength="200"
                  /></label
                ><label class="inline"
                  ><input
                    type="radio"
                    name="primary-photo"
                    value={photo.id}
                    bind:group={draft.primaryPhotoId}
                  />{l("Primary photo", "Foto principale")}</label
                ><button type="button" onclick={() => removePhoto(photo.id)}
                  >{l("Remove photo", "Rimuovi foto")}</button
                >
              </div>{/each}
          </div>
        </fieldset>
        <button class="primary" disabled={pending || !propertyId}
          >{t("Save door")}</button
        >
      </form>{/if}
  {:else if detail}
    {@const photos = detail.photos ?? []}{@const activePhoto =
      photos.find((p) => p.id === selectedPhoto) ?? primary(detail)}
    <article class="card stack">
      <div class="row spread">
        <h2>{detail.name}</h2>
        <button onclick={back}>{t("Back to doors")}</button>
      </div>
      {#if activePhoto}<img
          class="detail-photo"
          src={activePhoto.url}
          alt={activePhoto.alt}
        />
        <div class="thumbnails">
          {#each photos as photo (photo.id)}<button
              aria-label={l("View photo: ", "Vedi foto: ") + photo.alt}
              class={{ chosen: photo.id === activePhoto.id }}
              onclick={() => (selectedPhoto = photo.id)}
              ><img src={photo.url} alt={photo.alt} /></button
            >{/each}
        </div>{/if}
      {#if detail.description}<p class="description">
          {detail.description}
        </p>{/if}
      <dl>
        <dt>{l("Status", "Stato")}</dt>
        <dd>
          {detail.enabled === false
            ? l("Disabled", "Disabilitata")
            : l("Enabled", "Abilitata")}
        </dd>
        <dt>{t("Integration")}</dt>
        <dd>
          {detail.integration === "none"
            ? t("Not connected yet")
            : detail.integration === "shelly"
              ? "Shelly Cloud"
              : "eWeLink"}
        </dd>
        <dt>{l("Default permissions", "Permessi predefiniti")}</dt>
        <dd>
          {t(detail.common ? "Common door" : "Room door")} · {detail.singleUse
            ? l("Single use", "Uso singolo")
            : l("Multiple uses", "Utilizzi multipli")}
        </dd>
      </dl>
      {@render doorActions(detail)}
    </article>
  {:else if detailId}<div class="card">
      <p>{l("Door not found.", "Porta non trovata.")}</p>
      <button onclick={back}>{t("Back to doors")}</button>
    </div>
  {:else}
    <div class="row spread filter-row">
      <label
        >{l("Show doors", "Mostra porte")}<select
          bind:value={filter}
          disabled={!!orderIds}
          ><option value="all">{l("All doors", "Tutte le porte")}</option
          ><option value="enabled">{l("Enabled", "Abilitate")}</option><option
            value="disabled">{l("Disabled", "Disabilitate")}</option
          ></select
        ></label
      >
      {#if owner && localDoors.length > 1}{#if orderIds}<div class="row">
            <button disabled={pending} onclick={() => run(saveOrder)}
              >{l("Save order", "Salva ordine")}</button
            ><button disabled={pending} onclick={() => (orderIds = null)}
              >{t("Cancel")}</button
            >
          </div>{:else}<button
            onclick={() => {
              filter = "all";
              orderIds = localDoors.map((d) => d.id);
            }}>{l("Reorder doors", "Riordina porte")}</button
          >{/if}{/if}
    </div>
    {#if orderIds}<p class="muted">
        {l(
          "Drag a door or use the arrow buttons. Save to apply this order for hosts and guests.",
          "Trascina una porta o usa le frecce. Salva per applicare l’ordine per host e ospiti.",
        )}
      </p>{/if}
    <ul class="door-list item-group">
      {#each visibleDoors as door, index (door.id)}<li
          class="door-row"
          draggable={!!orderIds && !pending}
          ondragstart={(e) => {
            dragged = door.id;
            e.dataTransfer?.setData("text/plain", door.id);
          }}
          ondragover={(e) => {
            if (orderIds) e.preventDefault();
          }}
          ondrop={(e) => {
            e.preventDefault();
            if (orderIds) drop(door.id);
          }}
          ondragend={() => (dragged = "")}
        >
          {#if orderIds}<GripVertical size={18} />{/if}
          <button
            class="door-summary"
            aria-label={door.name}
            disabled={!!orderIds}
            onclick={() => {
              detailId = door.id;
              selectedPhoto = "";
              confirmation = null;
              result = null;
            }}
          >
            {#if primary(door)}<img
                class="door-thumb"
                src={primary(door)?.url}
                alt=""
              />{:else}<span class="door-icon"><DoorOpen size={21} /></span
              >{/if}
            <span class="door-copy"
              ><strong>{door.name}</strong><small
                >{door.integration === "none"
                  ? t("Not connected yet")
                  : door.integration === "shelly"
                    ? "Shelly Cloud"
                    : "eWeLink"}{#if door.enabled === false}
                  · {l("Disabled", "Disabilitata")}{/if}</small
              ></span
            >
            {#if !orderIds}<ChevronRight size={18} />{/if}
          </button>
          {#if orderIds}<div class="row order-actions">
              <button
                class="icon-button"
                aria-label={l("Move up: ", "Sposta su: ") + door.name}
                disabled={pending || index === 0}
                onclick={() => move(door.id, -1)}><ArrowUp size={18} /></button
              >
              <button
                class="icon-button"
                aria-label={l("Move down: ", "Sposta giù: ") + door.name}
                disabled={pending || index === visibleDoors.length - 1}
                onclick={() => move(door.id, 1)}><ArrowDown size={18} /></button
              >
            </div>
          {:else if door.integration !== "none"}
            <button
              class="icon-button test-button"
              aria-label={door.testAction?.status === "uncertain"
                ? l("Check uncertain test", "Verifica test incerto")
                : l("Test opening", "Prova apertura")}
              title={door.testAction?.status === "uncertain"
                ? l("Check uncertain test", "Verifica test incerto")
                : l("Test opening", "Prova apertura")}
              disabled={pending ||
                door.testAction?.status === "pending" ||
                (door.enabled === false &&
                  door.testAction?.status !== "uncertain")}
              onclick={() =>
                ask(
                  door.testAction?.status === "uncertain" ? "resolve" : "test",
                  door,
                )}
            >
              {#if door.testAction?.status === "uncertain"}<CircleAlert
                  size={20}
                />{:else}<DoorOpen size={20} />{/if}
            </button>
          {/if}
        </li>{/each}
    </ul>
    {#if !visibleDoors.length}<div class="card empty-state">
        <DoorOpen size={36} />
        <h2>
          {localDoors.length
            ? l("No matching doors", "Nessuna porta corrispondente")
            : t("No doors yet")}
        </h2>
        {#if !localDoors.length}<p>
            {t(
              "Add an entrance or room, connect its device, and choose its default access rules.",
            )}
          </p>
          {#if !owner}<small>{t("An owner can add doors for your team.")}</small
            >{/if}{/if}
      </div>{/if}
  {/if}
</section>

{#snippet doorActions(door: Door)}
  <div class="row actions">
    {#if door.testAction?.status === "uncertain"}<button
        disabled={pending}
        onclick={() => ask("resolve", door)}
        >{l("Check uncertain test", "Verifica test incerto")}</button
      >{:else}<button
        disabled={pending ||
          door.integration === "none" ||
          door.enabled === false ||
          door.testAction?.status === "pending"}
        onclick={() => ask("test", door)}
        >{door.testAction?.status === "pending"
          ? l("Test pending", "Test in corso")
          : l("Test opening", "Prova apertura")}</button
      >{/if}
    {#if owner}<button disabled={pending} onclick={() => editDoor(door)}
        >{t("Edit")}</button
      ><button disabled={pending} onclick={() => ask("delete", door)}
        >{l("Delete", "Elimina")}</button
      >{/if}
  </div>
{/snippet}

<style>
  .door-list {
    list-style: none;
    padding: 0;
  }
  .door-list .door-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }
  .door-list .door-row:last-child {
    border-bottom: 0;
  }
  .door-summary {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    background: transparent;
    border: 0;
    border-radius: 0;
    padding: 8px 0;
    text-align: left;
  }
  .door-copy {
    display: grid;
    gap: 5px;
    min-width: 0;
    flex: 1;
  }
  .door-copy strong,
  .door-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .door-copy strong {
    font-size: 14px;
    font-weight: 600;
  }
  .door-copy small {
    font-size: 12px;
    color: var(--muted-foreground);
  }
  .test-button,
  .order-actions {
    flex-shrink: 0;
  }
  .door-summary > :global(svg) {
    color: var(--muted-foreground);
    flex-shrink: 0;
  }
  .filter-row {
    margin: 16px 0;
  }
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
  }
  .photo-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .photo-card img {
    width: 100%;
    height: 150px;
    object-fit: cover;
    border-radius: 8px;
  }
  .detail-photo {
    width: 100%;
    max-height: 450px;
    object-fit: contain;
    border-radius: 10px;
  }
  .thumbnails {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .thumbnails button {
    padding: 3px;
  }
  .thumbnails img {
    width: 74px;
    height: 60px;
    object-fit: cover;
  }
  .thumbnails .chosen {
    outline: 2px solid var(--primary);
  }
  .door-thumb {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    object-fit: cover;
    border-radius: 8px;
  }
  .description {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .confirmation {
    border: 2px solid var(--destructive);
  }
  .actions {
    flex-wrap: wrap;
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }
  dl {
    display: grid;
    grid-template-columns: minmax(100px, 1fr) 2fr;
    gap: 10px;
  }
  dt {
    font-weight: 600;
  }
  dd {
    margin: 0;
  }
  small {
    display: block;
  }
  .row button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  @media (max-width: 600px) {
    .actions {
      width: 100%;
    }
    .actions button {
      flex: 1;
    }
    .photo-grid {
      grid-template-columns: 1fr 1fr;
    }
    .photo-card img {
      height: 120px;
    }
  }
</style>
