<script lang="ts">
  import FeedbackToast from "$lib/components/FeedbackToast.svelte";
  import { flip } from "svelte/animate";
  import { MediaQuery } from "svelte/reactivity";
  import { randomUUID } from "$lib/browser";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Badge } from "$lib/components/ui/badge";
  import { Switch } from "$lib/components/ui/switch";
  import { Separator } from "$lib/components/ui/separator";
  import * as Card from "$lib/components/ui/card";
  import * as Alert from "$lib/components/ui/alert";
  import * as NativeSelect from "$lib/components/ui/native-select";
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
    canCreate = false,
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
    canCreate?: boolean;
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
  const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  let gestureOrder: string[] | null = null;
  let pointerId: number | null = null;
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
      pointerId = null;
      gestureOrder = null;
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
  function dragStart(e: PointerEvent, id: string) {
    if (!orderIds || pending || !e.isPrimary || e.button !== 0) return;
    pointerId = e.pointerId;
    gestureOrder = [...orderIds];
    dragged = id;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function dragMove(e: PointerEvent) {
    if (!dragged || pointerId !== e.pointerId || !orderIds) return;
    const row = document
      .elementsFromPoint(e.clientX, e.clientY)
      .map((el) => el.closest<HTMLElement>("[data-door-order]"))
      .find(Boolean);
    const id = row?.dataset.doorOrder;
    if (id && id !== dragged) {
      const ids = [...orderIds],
        from = ids.indexOf(dragged),
        to = ids.indexOf(id);
      if (from >= 0 && to >= 0) {
        ids.splice(from, 1);
        ids.splice(to, 0, dragged);
        orderIds = ids;
      }
    }
    if (e.clientY < 100) window.scrollBy(0, -12);
    if (e.clientY > window.innerHeight - 100) window.scrollBy(0, 12);
  }
  function dragEnd(e: PointerEvent, cancelled = false) {
    if (pointerId !== e.pointerId) return;
    if (cancelled && gestureOrder) orderIds = gestureOrder;
    pointerId = null;
    gestureOrder = null;
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

<svelte:window
  onpointermove={dragMove}
  onpointerup={(e) => dragEnd(e)}
  onpointercancel={(e) => dragEnd(e, true)}
/>

<section class="door-manager space-y-6" aria-label={t("Doors")}>
  {#if !editor && !detailId}
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="space-y-1">
        <p class="text-sm text-muted-foreground">
          {t("The doors your guests can use.")}
        </p>
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{localDoors.length}</Badge>
          <span>{t("doors in")} {propertyName || t("your property")}</span>
        </div>
      </div>
    </div>
  {/if}

  {#if error}
    <Alert.Root variant="destructive" role="alert"
      ><CircleAlert size={16} /><Alert.Description>{error}</Alert.Description
      ></Alert.Root
    >
  {/if}
  <FeedbackToast {message} />
  {#if result}
    <Alert.Root
      role="status"
      variant={result.status === "failed" ? "destructive" : "default"}
    >
      <CircleAlert size={16} />
      <Alert.Title
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
              )}</Alert.Title
      >
      <Alert.Description class="space-y-2">
        <p>{result.detail}</p>
        <p>
          {l(
            "Provider acceptance does not prove that the door physically opened. No automatic retry is sent.",
            "L’accettazione del fornitore non prova che la porta si sia aperta fisicamente. Non viene eseguito alcun tentativo automatico.",
          )}
        </p>
      </Alert.Description>
    </Alert.Root>
  {/if}

  {#if confirmation}
    <Card.Root
      class="confirmation border border-destructive/40"
      role="region"
      aria-label={l("Confirm door action", "Conferma azione porta")}
    >
      <Card.Header>
        <Card.Title
          >{confirmation.kind === "test"
            ? l("Test opening", "Prova apertura")
            : confirmation.kind === "delete"
              ? l("Delete door", "Elimina porta")
              : l("Resolve uncertain test", "Risolvi test incerto")}: {confirmation
            .door.name}</Card.Title
        >
        <Card.Description
          >{confirmation.kind === "test"
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
                )}</Card.Description
        >
      </Card.Header>
      <Card.Content>
        <div class="flex items-center gap-3">
          <Switch id="door-action-confirm" bind:checked={acknowledged} />
          <Label for="door-action-confirm"
            >{l("I understand and confirm", "Ho compreso e confermo")}</Label
          >
        </div>
      </Card.Content>
      <Card.Footer class="flex flex-wrap gap-2">
        <Button
          variant={confirmation.kind === "delete" ? "destructive" : "default"}
          disabled={!acknowledged || pending}
          onclick={() => run(confirmAction)}
          >{confirmation.kind === "test"
            ? l("Send unlock request", "Invia richiesta di apertura")
            : l("Confirm", "Conferma")}</Button
        >
        <Button
          variant="outline"
          disabled={pending}
          onclick={() => (confirmation = null)}>{t("Cancel")}</Button
        >
      </Card.Footer>
    </Card.Root>
  {/if}

  {#if !propertyId}
    <Card.Root class="py-12 text-center">
      <Card.Content class="flex flex-col items-center gap-4">
        <div
          class="flex size-14 items-center justify-center rounded-xl bg-muted"
        >
          <DoorOpen size={28} />
        </div>
        <h2 class="text-lg font-semibold">{t("Add your property first")}</h2>
        <p class="text-sm text-muted-foreground">
          {t("Then connect the doors guests will access.")}
        </p>
        {#if owner}<Button onclick={onSetup}>{t("Set up a property")}</Button
          >{:else}<p class="text-sm text-muted-foreground">
            {t("Ask an owner to set up a property and its doors.")}
          </p>{/if}
      </Card.Content>
    </Card.Root>
  {:else if editor && (owner || (canCreate && !editId))}
    {#if editId && !localDoors.some((d) => d.id === editId)}
      <Alert.Root
        ><Alert.Description
          >{l(
            "This door is not available in the selected property.",
            "Questa porta non è disponibile nella struttura selezionata.",
          )}</Alert.Description
        ></Alert.Root
      >
      <Button variant="outline" onclick={back}>{t("Back to doors")}</Button>
    {:else}
      <form
        data-tour="door-form"
        class="space-y-6"
        onsubmit={(e) => {
          e.preventDefault();
          void run(save);
        }}
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">
            {t(editId ? "Edit door" : "Add door")}
          </h2>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onclick={back}>{t("Back to doors")}</Button
          >
        </div>
        <Card.Root>
          <Card.Header>
            <Card.Title>{l("Door details", "Dettagli della porta")}</Card.Title>
            <Card.Description
              >{l(
                "Give guests a recognizable name and directions to this door.",
                "Scegli un nome riconoscibile e spiega agli ospiti come trovare la porta.",
              )}</Card.Description
            >
          </Card.Header>
          <Card.Content class="space-y-5">
            <div class="space-y-2">
              <Label for="door-name">{t("Name")}</Label><Input
                id="door-name"
                bind:value={draft.name}
                required
                maxlength={120}
                placeholder={l("e.g. Main entrance", "es. Ingresso principale")}
              />
            </div>
            <div class="space-y-2">
              <Label for="door-description"
                >{l("Description", "Descrizione")}</Label
              ><Textarea
                id="door-description"
                bind:value={draft.description}
                maxlength={3000}
                placeholder={l(
                  "Help guests locate and use this door",
                  "Aiuta gli ospiti a trovare e usare questa porta",
                )}
              />
            </div>
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header
            ><Card.Title
              >{l("Access defaults", "Accesso predefinito")}</Card.Title
            ><Card.Description
              >{l(
                "Choose the starting rules for new access codes. You can change them for each guest.",
                "Scegli le regole iniziali per i nuovi codici. Potrai modificarle per ogni ospite.",
              )}</Card.Description
            ></Card.Header
          >
          <Card.Content class="space-y-4">
            <div class="flex items-start justify-between gap-4">
              <div class="space-y-1">
                <Label for="door-enabled"
                  >{l(
                    "Enabled for guest access",
                    "Abilitata per l’accesso ospiti",
                  )}</Label
                >
                <p class="text-sm text-muted-foreground">
                  {l(
                    "Turn off access while keeping the connection and permissions.",
                    "Disattiva l’accesso mantenendo la connessione e i permessi.",
                  )}
                </p>
              </div>
              <Switch id="door-enabled" bind:checked={draft.enabled} />
            </div>
            <Separator />
            <div class="flex items-start justify-between gap-4">
              <div class="space-y-1">
                <Label for="door-common">{t("Common door · preselected")}</Label
                >
                <p class="text-sm text-muted-foreground">
                  {l(
                    "Include this door when you create a new code, such as a shared entrance.",
                    "Includi questa porta nei nuovi codici, ad esempio un ingresso comune.",
                  )}
                </p>
              </div>
              <Switch id="door-common" bind:checked={draft.common} />
            </div>
            <Separator />
            <div class="flex items-start justify-between gap-4">
              <div class="space-y-1">
                <Label for="door-single-use">{t("Single use by default")}</Label
                >
                <p class="text-sm text-muted-foreground">
                  {l(
                    "New codes will allow one accepted request for this door.",
                    "I nuovi codici consentiranno una richiesta accettata per questa porta.",
                  )}
                </p>
              </div>
              <Switch id="door-single-use" bind:checked={draft.singleUse} />
            </div>
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header
            ><Card.Title
              >{l(
                "Device connection",
                "Connessione al dispositivo",
              )}</Card.Title
            ><Card.Description
              >{l(
                "You can save an example door now and connect the opening device later.",
                "Puoi salvare una porta di esempio e collegare il dispositivo di apertura in seguito.",
              )}</Card.Description
            ></Card.Header
          >
          <Card.Content class="space-y-5">
            <div class="space-y-2">
              <Label for="door-integration">{t("Integration")}</Label
              ><NativeSelect.Root
                id="door-integration"
                bind:value={draft.integration}
                class="w-full"
                ><NativeSelect.Option value="none"
                  >{t("Connect later (example door)")}</NativeSelect.Option
                ><NativeSelect.Option value="ewelink"
                  >eWeLink webhook</NativeSelect.Option
                ><NativeSelect.Option value="shelly"
                  >Shelly Cloud</NativeSelect.Option
                ></NativeSelect.Root
              >
            </div>
            {#if draft.integration === "ewelink"}
              <div class="space-y-2">
                <Label for="door-webhook">{t("eWeLink webhook code")}</Label
                ><Input
                  id="door-webhook"
                  type="password"
                  bind:value={webhook}
                  autocomplete="off"
                  required={!editId}
                />
              </div>
            {:else if draft.integration === "shelly"}
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2 sm:col-span-2">
                  <Label for="door-cloud-host">{t("Shelly Cloud host")}</Label
                  ><Input
                    id="door-cloud-host"
                    bind:value={cloudHost}
                    placeholder="shelly-196-eu.shelly.cloud"
                    required={!editId}
                  />
                </div>
                <div class="space-y-2">
                  <Label for="door-device-id">{t("Device ID")}</Label><Input
                    id="door-device-id"
                    bind:value={deviceId}
                    required={!editId}
                  />
                </div>
                <div class="space-y-2">
                  <Label for="door-api-key">{t("API key")}</Label><Input
                    id="door-api-key"
                    type="password"
                    bind:value={apiKey}
                    autocomplete="off"
                    required={!editId}
                  />
                </div>
              </div>
            {/if}
            {#if draft.integration === "none"}<Alert.Root
                ><Alert.Description
                  >{t(
                    "This is an example door. You will add a device connector later. No unlock request can be sent until it is connected.",
                  )}</Alert.Description
                ></Alert.Root
              >{:else if editId}<p class="text-sm text-muted-foreground">
                {t(
                  "Leave credentials empty when editing to keep existing values.",
                )}
              </p>{/if}
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header
            ><Card.Title
              >{l("Guest languages", "Lingue degli ospiti")}</Card.Title
            ><Card.Description
              >{l(
                "Optional names and directions in the guest app’s five languages.",
                "Nomi e indicazioni facoltativi nelle cinque lingue dell’app ospiti.",
              )}</Card.Description
            ></Card.Header
          >
          <Card.Content>
            <details class="group">
              <summary class="cursor-pointer text-sm font-medium"
                >{l(
                  "Translated names and descriptions (optional)",
                  "Nomi e descrizioni tradotti (facoltativi)",
                )}</summary
              >
              <div class="mt-5 space-y-5">
                {#each ["en", "it", "fr", "es", "de"] as lang (lang)}
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="space-y-2">
                      <Label for={"door-name-" + lang}
                        >{lang.toUpperCase()} · {t("Name")}</Label
                      ><Input
                        id={"door-name-" + lang}
                        bind:value={draft.translations[lang]}
                        placeholder={draft.name}
                        maxlength={120}
                      />
                    </div>
                    <div class="space-y-2">
                      <Label for={"door-description-" + lang}
                        >{lang.toUpperCase()} · {l(
                          "Description",
                          "Descrizione",
                        )}</Label
                      ><Textarea
                        id={"door-description-" + lang}
                        bind:value={draft.descriptionTranslations[lang]}
                        placeholder={draft.description}
                        maxlength={3000}
                      />
                    </div>
                  </div>
                {/each}
              </div>
            </details>
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header
            ><Card.Title>{l("Door photos", "Foto della porta")}</Card.Title
            ><Card.Description
              >{l(
                "Help guests recognize the entrance. Photos are resized in your browser before saving.",
                "Aiuta gli ospiti a riconoscere l’ingresso. Le foto vengono ridimensionate nel browser prima del salvataggio.",
              )}</Card.Description
            ></Card.Header
          >
          <Card.Content class="space-y-5">
            <div class="space-y-2">
              <Label for="door-photo-upload"
                >{l("Add photos (up to 4)", "Aggiungi foto (fino a 4)")}</Label
              ><Input
                id="door-photo-upload"
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
              />
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              {#each draft.photos as photo (photo.id)}
                <div class="photo-card space-y-3 rounded-lg border p-3">
                  <img
                    class="h-40 w-full rounded-md object-cover"
                    src={photo.url}
                    alt={photo.alt}
                  />
                  <div class="space-y-2">
                    <Label for={"photo-alt-" + photo.id}
                      >{l("Photo description", "Descrizione foto")}</Label
                    ><Input
                      id={"photo-alt-" + photo.id}
                      bind:value={photo.alt}
                      maxlength={200}
                    />
                  </div>
                  <label class="flex items-center gap-2 text-sm"
                    ><input
                      class="size-4 accent-primary"
                      type="radio"
                      name="primary-photo"
                      value={photo.id}
                      bind:group={draft.primaryPhotoId}
                    />{l("Primary photo", "Foto principale")}</label
                  >
                  <Button
                    variant="outline"
                    type="button"
                    onclick={() => removePhoto(photo.id)}
                    >{l("Remove photo", "Rimuovi foto")}</Button
                  >
                </div>
              {/each}
            </div>
          </Card.Content>
        </Card.Root>
        <div
          class="flex flex-wrap items-center justify-end gap-3 border-t pt-5"
        >
          <Button
            variant="outline"
            type="button"
            disabled={pending}
            onclick={back}>{t("Cancel")}</Button
          >
          <Button type="submit" disabled={pending || !propertyId}
            >{t("Save door")}</Button
          >
        </div>
      </form>
    {/if}
  {:else if detail}
    {@const photos = detail.photos ?? []}
    {@const activePhoto =
      photos.find((p) => p.id === selectedPhoto) ?? primary(detail)}
    <Card.Root>
      <Card.Header class="gap-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Card.Title>{detail.name}</Card.Title><Button
            variant="outline"
            onclick={back}>{t("Back to doors")}</Button
          >
        </div>
        <div class="flex flex-wrap gap-2">
          <Badge variant={detail.enabled === false ? "outline" : "secondary"}
            >{detail.enabled === false
              ? l("Disabled", "Disabilitata")
              : l("Enabled", "Abilitata")}</Badge
          ><Badge variant="outline"
            >{detail.integration === "none"
              ? t("Not connected yet")
              : detail.integration === "shelly"
                ? "Shelly Cloud"
                : "eWeLink"}</Badge
          >
        </div>
      </Card.Header>
      <Card.Content class="space-y-5">
        {#if activePhoto}
          <img
            class="detail-photo max-h-96 w-full rounded-lg object-contain"
            src={activePhoto.url}
            alt={activePhoto.alt}
          />
          <div class="flex flex-wrap gap-2">
            {#each photos as photo (photo.id)}<Button
                variant="outline"
                class={photo.id === activePhoto.id
                  ? "h-auto p-1 ring-2 ring-primary"
                  : "h-auto p-1"}
                aria-label={l("View photo: ", "Vedi foto: ") + photo.alt}
                onclick={() => (selectedPhoto = photo.id)}
                ><img
                  class="h-14 w-16 rounded-sm object-cover"
                  src={photo.url}
                  alt={photo.alt}
                /></Button
              >{/each}
          </div>
        {/if}
        {#if detail.description}<p class="whitespace-pre-wrap text-sm">
            {detail.description}
          </p>{/if}
        <Separator />
        <dl class="grid gap-3 text-sm sm:grid-cols-[minmax(140px,1fr)_2fr]">
          <dt class="text-muted-foreground">{l("Status", "Stato")}</dt>
          <dd>
            {detail.enabled === false
              ? l("Disabled", "Disabilitata")
              : l("Enabled", "Abilitata")}
          </dd>
          <dt class="text-muted-foreground">{t("Integration")}</dt>
          <dd>
            {detail.integration === "none"
              ? t("Not connected yet")
              : detail.integration === "shelly"
                ? "Shelly Cloud"
                : "eWeLink"}
          </dd>
          <dt class="text-muted-foreground">
            {l("Default permissions", "Permessi predefiniti")}
          </dt>
          <dd>
            {t(detail.common ? "Common door" : "Room door")} · {detail.singleUse
              ? l("Single use", "Uso singolo")
              : l("Multiple uses", "Utilizzi multipli")}
          </dd>
        </dl>
      </Card.Content>
      <Card.Footer>{@render doorActions(detail)}</Card.Footer>
    </Card.Root>
  {:else if detailId}
    <Alert.Root
      ><Alert.Description
        >{l("Door not found.", "Porta non trovata.")}</Alert.Description
      ></Alert.Root
    ><Button variant="outline" onclick={back}>{t("Back to doors")}</Button>
  {:else}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <Label for="door-filter">{l("Show doors", "Mostra porte")}</Label
        ><NativeSelect.Root
          id="door-filter"
          bind:value={filter}
          disabled={!!orderIds}
          ><NativeSelect.Option value="all"
            >{l("All doors", "Tutte le porte")}</NativeSelect.Option
          ><NativeSelect.Option value="enabled"
            >{l("Enabled", "Abilitate")}</NativeSelect.Option
          ><NativeSelect.Option value="disabled"
            >{l("Disabled", "Disabilitate")}</NativeSelect.Option
          ></NativeSelect.Root
        >
      </div>
      {#if owner && localDoors.length > 1}
        {#if orderIds}<div class="flex gap-2">
            <Button disabled={pending} onclick={() => run(saveOrder)}
              >{l("Save order", "Salva ordine")}</Button
            ><Button
              variant="outline"
              disabled={pending}
              onclick={() => (orderIds = null)}>{t("Cancel")}</Button
            >
          </div>
        {:else}<Button
            variant="outline"
            onclick={() => {
              filter = "all";
              orderIds = localDoors.map((d) => d.id);
            }}>{l("Reorder doors", "Riordina porte")}</Button
          >{/if}
      {/if}
    </div>
    {#if orderIds}<Alert.Root
        ><Alert.Description
          >{l(
            "Drag a door or use the arrow buttons. Save to apply this order for hosts and guests.",
            "Trascina una porta o usa le frecce. Salva per applicare l’ordine per host e ospiti.",
          )}</Alert.Description
        ></Alert.Root
      >{/if}
    {#if visibleDoors.length}
      <Card.Root class="gap-0 py-0">
        <ul class="door-list divide-y divide-border">
          {#each visibleDoors as door, index (door.id)}
            <li
              class="door-row flex items-center gap-3 px-4 py-2"
              data-door-order={door.id}
              data-dragging={dragged === door.id}
              animate:flip={{ duration: reducedMotion.current ? 0 : 160 }}
            >
              {#if orderIds}<Button
                  variant="ghost"
                  size="icon"
                  class="door-drag-handle shrink-0 touch-none cursor-grab active:cursor-grabbing"
                  disabled={pending}
                  aria-label={l(
                    "Drag to reorder: ",
                    "Trascina per riordinare: ",
                  ) + door.name}
                  aria-pressed={dragged === door.id}
                  onpointerdown={(e) => dragStart(e, door.id)}
                  onkeydown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      move(door.id, e.key === "ArrowUp" ? -1 : 1);
                    }
                  }}><GripVertical size={18} /></Button
                >{/if}
              <Button
                variant="ghost"
                class="h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal px-2 py-3 text-left"
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
                    class="size-11 shrink-0 rounded-lg object-cover"
                    src={primary(door)?.url}
                    alt=""
                  />{:else}<span
                    class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted"
                    ><DoorOpen size={21} /></span
                  >{/if}
                <span class="grid min-w-0 flex-1 gap-1"
                  ><strong class="truncate text-sm font-medium"
                    >{door.name}</strong
                  ><span class="truncate text-xs text-muted-foreground"
                    >{door.integration === "none"
                      ? t("Not connected yet")
                      : door.integration === "shelly"
                        ? "Shelly Cloud"
                        : "eWeLink"}{#if door.enabled === false}
                      · {l("Disabled", "Disabilitata")}{/if}</span
                  ></span
                >
                {#if !orderIds}<ChevronRight
                    class="shrink-0 text-muted-foreground"
                    size={18}
                  />{/if}
              </Button>
              {#if orderIds}
                <div class="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={l("Move up: ", "Sposta su: ") + door.name}
                    disabled={pending || index === 0}
                    onclick={() => move(door.id, -1)}
                    ><ArrowUp size={18} /></Button
                  ><Button
                    variant="ghost"
                    size="icon"
                    aria-label={l("Move down: ", "Sposta giù: ") + door.name}
                    disabled={pending || index === visibleDoors.length - 1}
                    onclick={() => move(door.id, 1)}
                    ><ArrowDown size={18} /></Button
                  >
                </div>
              {:else if owner && door.integration !== "none"}
                <Button
                  variant="outline"
                  size="icon"
                  class="shrink-0"
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
                      door.testAction?.status === "uncertain"
                        ? "resolve"
                        : "test",
                      door,
                    )}
                  >{#if door.testAction?.status === "uncertain"}<CircleAlert
                      size={20}
                    />{:else}<DoorOpen size={20} />{/if}</Button
                >
              {/if}
            </li>
          {/each}
        </ul>
      </Card.Root>
    {:else}
      <Card.Root class="py-10 text-center"
        ><Card.Content class="flex flex-col items-center gap-3"
          ><div
            class="flex size-14 items-center justify-center rounded-xl bg-muted"
          >
            <DoorOpen size={28} />
          </div>
          <h2 class="text-lg font-semibold">
            {localDoors.length
              ? l("No matching doors", "Nessuna porta corrispondente")
              : t("No doors yet")}
          </h2>
          {#if !localDoors.length}<p
              class="max-w-sm text-sm text-muted-foreground"
            >
              {t(
                "Add an entrance or room, connect its device, and choose its default access rules.",
              )}
            </p>
            {#if !owner && !canCreate}<p class="text-sm text-muted-foreground">
                {t("An owner can add doors for your team.")}
              </p>{/if}{/if}</Card.Content
        ></Card.Root
      >
    {/if}
  {/if}
</section>

{#snippet doorActions(door: Door)}
  <div class="flex w-full flex-wrap gap-2">
    {#if owner}{#if door.testAction?.status === "uncertain"}<Button
          variant="outline"
          disabled={pending}
          onclick={() => ask("resolve", door)}
          >{l("Check uncertain test", "Verifica test incerto")}</Button
        >
      {:else}<Button
          disabled={pending ||
            door.integration === "none" ||
            door.enabled === false ||
            door.testAction?.status === "pending"}
          onclick={() => ask("test", door)}
          ><DoorOpen size={16} />{door.testAction?.status === "pending"
            ? l("Test pending", "Test in corso")
            : l("Test opening", "Prova apertura")}</Button
        >{/if}{/if}
    {#if owner}<Button
        variant="outline"
        disabled={pending}
        onclick={() => editDoor(door)}>{t("Edit")}</Button
      ><Button
        variant="destructive"
        class="sm:ml-auto"
        disabled={pending}
        onclick={() => ask("delete", door)}>{l("Delete", "Elimina")}</Button
      >{/if}
  </div>
{/snippet}
