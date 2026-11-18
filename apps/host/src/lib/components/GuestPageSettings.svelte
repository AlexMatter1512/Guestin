<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import FeedbackToast from "$lib/components/FeedbackToast.svelte";
  import GuestLocalizedEditor from "$lib/components/GuestLocalizedEditor.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import { demoMode } from "$lib/transport";
  import {
    demoWorkspace,
    type DemoWorkspace,
  } from "../../../../../shared/demo-workspace";
  import { t } from "$lib/i18n.svelte";
  import {
    defaultGuestPage,
    defaultGuestAccent,
    type GuestPageSettings,
    guestPageSchema,
    guestPreviewDoorLimit,
    type GuestPageVersion,
  } from "../../../../../shared/guest-page";

  let {
    property,
    doors,
    owner,
    api,
    reload,
  }: {
    property:
      | {
          id: string;
          name: string;
          logo?: string | null;
          guestPage?: GuestPageSettings;
        }
      | undefined;
    doors: { id: string; propertyId: string; name: string }[];
    owner: boolean;
    api: (path: string, body?: unknown, method?: string) => Promise<unknown>;
    reload: () => Promise<void>;
  } = $props();

  let setting = $state<GuestPageSettings>(
    guestPageSchema.parse(defaultGuestPage),
  );
  let pending = $state(false),
    error = $state(""),
    message = $state("");
  const savedSettings = $derived(JSON.stringify(property?.guestPage ?? {}));
  $effect(() => {
    setting = guestPageSchema.parse(JSON.parse(savedSettings));
  });

  let doorPicker = $state(false),
    selectedDoors = $state<string[]>([]);
  let previewFrame = $state("");
  let historyOpen = $state(false),
    historyBusy = $state(false),
    historyError = $state("");
  let versions = $state<GuestPageVersion[]>([]);
  const localDoors = $derived(
    doors.filter((door) => door.propertyId === property?.id),
  );

  function openPreview() {
    if (!property || !selectedDoors.length) return;
    const params = new URLSearchParams({ preview: property.id });
    for (const door of selectedDoors) params.append("door", door);
    const url = (demoMode ? "/demo/guest/?" : "/guest/?") + params;
    doorPicker = false;
    if (demoMode) {
      // The embedded guest preview reads the host's in-memory sample workspace.
      (
        window as Window & { __guestinDemoWorkspace?: DemoWorkspace }
      ).__guestinDemoWorkspace = demoWorkspace();
      previewFrame = url;
    } else window.open(url, "_blank", "noopener");
  }

  async function openHistory() {
    if (!property || !owner || historyBusy) return;
    historyOpen = true;
    historyBusy = true;
    historyError = "";
    versions = [];
    try {
      versions = (await api(
        `properties/${property.id}/guest-page/versions`,
      )) as GuestPageVersion[];
    } catch (e) {
      historyError = t((e as Error).message);
    } finally {
      historyBusy = false;
    }
  }
  async function save() {
    if (!property || pending || !owner) return;
    pending = true;
    error = "";
    message = "";
    try {
      setting = guestPageSchema.parse(
        await api(
          `properties/${property.id}/guest-page`,
          { guestPage: setting },
          "PATCH",
        ),
      );
      await reload();
      message = t("Guest page settings saved.");
    } catch (e) {
      error = t((e as Error).message);
    } finally {
      pending = false;
    }
  }
</script>

{#if !property}
  <p class="muted">{t("Select a property first")}</p>
{:else}
  <form
    class="stack"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <div class="row spread">
      <p class="muted">{property.name}</p>
      <div class="row">
        <Button
          type="button"
          variant="outline"
          onclick={() => {
            selectedDoors = [];
            doorPicker = true;
          }}>{t("Open guest page")}</Button
        >
        {#if owner}<Button type="button" variant="outline" onclick={openHistory}
            >{t("Previous versions")}</Button
          >{/if}
      </div>
    </div>
    <div class="stack rounded-lg border p-4">
      <Label class="inline" for="guest-show-logo">
        <Switch
          id="guest-show-logo"
          bind:checked={setting.showLogo}
          disabled={!owner || pending}
        />
        {t("Show property logo")}
      </Label>
      {#if property.logo}<img
          src={property.logo}
          alt={property.name}
          class="h-14 max-w-32 object-contain object-left"
        />
      {:else}<p class="muted">
          {t("Upload a logo when editing this property in Properties.")}
        </p>{/if}
      <Label for="guest-accent">{t("Accent color")}</Label>
      <div class="row">
        <Input
          id="guest-accent"
          type="color"
          class="h-10 w-14 cursor-pointer"
          value={setting.accentColor ?? defaultGuestAccent}
          disabled={!owner || pending}
          oninput={(event) => (setting.accentColor = event.currentTarget.value)}
        />
        {#if setting.accentColor}
          <Button
            type="button"
            variant="ghost"
            disabled={!owner || pending}
            onclick={() => (setting.accentColor = null)}
            >{t("Use default accent")}</Button
          >
        {/if}
      </div>
    </div>
    <GuestLocalizedEditor
      id="guest-intro"
      label={t("Intro text")}
      kind="intro"
      bind:value={setting.intro}
      disabled={!owner || pending}
    />
    <GuestLocalizedEditor
      id="guest-single-use"
      label={t("Single-use door message")}
      kind="singleUse"
      bind:value={setting.singleUse}
      disabled={!owner || pending}
    />
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <FeedbackToast {message} />
    {#if owner}<Button type="submit" disabled={pending}
        >{t("Save guest page settings")}</Button
      >
    {:else}<p class="muted">{t("An owner can change these settings.")}</p>{/if}
  </form>
{/if}

<Modal
  open={doorPicker}
  title={t("Choose preview doors")}
  onclose={() => (doorPicker = false)}
>
  <div class="stack">
    <p class="muted">
      {t("The preview uses the saved settings. Its buttons do not open doors.")}
    </p>
    {#each localDoors as door (door.id)}
      <label class="inline-flex items-center gap-2">
        <input
          type="checkbox"
          value={door.id}
          bind:group={selectedDoors}
          disabled={selectedDoors.length >= guestPreviewDoorLimit &&
            !selectedDoors.includes(door.id)}
        />
        {door.name}
      </label>
    {:else}<p class="muted">
        {t("Add a door to this property to preview it.")}
      </p>{/each}
    <Button disabled={!selectedDoors.length} onclick={openPreview}
      >{t("Open preview")}</Button
    >
  </div>
</Modal>
<Modal
  open={!!previewFrame}
  title={t("Guest page preview")}
  onclose={() => (previewFrame = "")}
>
  <iframe
    src={previewFrame}
    title={t("Guest page preview")}
    class="h-[65dvh] w-full rounded-lg border"
  ></iframe>
</Modal>
<Modal
  open={historyOpen}
  title={t("Previous versions")}
  onclose={() => (historyOpen = false)}
>
  <div class="stack">
    {#if historyBusy}<p class="muted" role="status">{t("Loading…")}</p>
    {:else if historyError}<p class="error" role="alert">{historyError}</p>
    {:else}
      {#each versions as version, index (index)}
        <div class="row spread rounded-lg border p-3">
          <span
            >{version.savedAt
              ? new Date(version.savedAt).toLocaleString()
              : t("Original settings")}</span
          >
          <Button
            variant="outline"
            disabled={pending}
            onclick={() => {
              setting = guestPageSchema.parse(version.guestPage);
              historyOpen = false;
              message = t("Version loaded. Save to publish these settings.");
            }}>{t("Load in editor")}</Button
          >
        </div>
      {:else}<p class="muted">{t("No previous versions yet.")}</p>{/each}
    {/if}
  </div>
</Modal>
