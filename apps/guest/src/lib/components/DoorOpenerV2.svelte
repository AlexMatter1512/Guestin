<script lang="ts">
  import { onDestroy } from "svelte";
  import { t, guestText } from "$lib/i18n/translations";
  import { locale_state } from "$lib/states.svelte";
  import { formatDateTime } from "$lib/utils/dateUtils";
  type Photo = { id: string; url: string; alt?: string };
  type Door = {
    id: string;
    name: string;
    times: { from: string; to: string };
    translations?: Record<string, string>;
    single_use?: boolean;
    used?: boolean | number;
    pending?: boolean;
    enabled?: boolean;
    active?: boolean;
    configured?: boolean;
    photos?: Photo[];
    primaryPhotoId?: string | null;
    description?: string;
    descriptionTranslations?: Record<string, string>;
  };
  let {
    allButtonsDisabled = $bindable(false),
    door,
    onOpen,
    clock,
    timezone,
  }: {
    allButtonsDisabled?: boolean;
    door: Door;
    onOpen: (door: Door) => Promise<{
      status: "accepted" | "failed" | "uncertain";
      detail: string;
    }>;
    clock: number;
    timezone: string;
  } = $props();
  let message = $state(""),
    showModal = $state(false),
    outcome = $state<"accepted" | "failed" | "uncertain">("accepted"),
    uncertain = $state(false),
    selectedPhoto = $state("");
  let timer: ReturnType<typeof setTimeout> | undefined,
    ownsLock = false;
  const valid_from = $derived(new Date(door.times.from));
  const valid_to = $derived(new Date(door.times.to));
  const expired = $derived(Date.parse(door.times.to) <= clock);
  const not_yet_valid = $derived(Date.parse(door.times.from) > clock);
  const consumed = $derived(!!door.single_use && !!door.used);
  const translatedName = $derived(
    door.translations?.[locale_state.current] || door.name,
  );
  const doorTitle = $derived(
    locale_state.current === "en"
      ? translatedName + " " + t("door")
      : t("door") + " " + translatedName,
  );
  const description = $derived(
    door.descriptionTranslations?.[locale_state.current] ||
      door.description ||
      "",
  );
  const activePhoto = $derived(
    door.photos?.find((p) => p.id === selectedPhoto) ??
      door.photos?.find((p) => p.id === door.primaryPhotoId) ??
      door.photos?.[0],
  );
  const doorStatus = $derived(
    uncertain || door.pending
      ? "uncertain"
      : door.enabled === false
        ? "disabled"
        : door.active === false
          ? "paused"
          : door.configured === false
            ? "unconfigured"
            : consumed
              ? "used"
              : not_yet_valid
                ? "future"
                : expired
                  ? "expired"
                  : "ready",
  );
  function openDialog(node: HTMLDialogElement) {
    node.showModal();
    return {
      destroy() {
        if (node.open) node.close();
      },
    };
  }
  function dismiss() {
    clearTimeout(timer);
    showModal = false;
    if (ownsLock) {
      allButtonsDisabled = false;
      ownsLock = false;
    }
  }
  onDestroy(dismiss);
  async function handleOpen() {
    if (allButtonsDisabled || doorStatus !== "ready") return;
    if (!navigator.onLine) {
      message = guestText("offline");
      outcome = "failed";
      showModal = true;
      allButtonsDisabled = true;
      ownsLock = true;
      return;
    }
    allButtonsDisabled = true;
    ownsLock = true;
    try {
      const response = await onOpen(door);
      outcome = response.status;
      if (response.status === "accepted")
        message = `✅ ${guestText("accepted")}`;
      else if (response.status === "uncertain") {
        uncertain = true;
        message = guestText("uncertain");
      } else message = `❌ ${t("error")}: ${response.detail}`;
    } catch {
      outcome = "uncertain";
      uncertain = true;
      message = guestText("uncertain");
    }
    showModal = true;
    if (outcome === "accepted") timer = setTimeout(dismiss, 3000);
  }
</script>

<article
  data-door-id={door.id}
  class="flex flex-col items-center p-6 rounded-2xl bg-white shadow-md border border-slate-200 gap-6 hover:shadow-lg transition-all duration-300 hover:border-slate-300"
>
  <div class="text-center">
    <h2 class="text-xl font-bold text-slate-800">
      {doorTitle}
    </h2>
  </div>

  <div class="relative">
    <img
      src={activePhoto?.url ??
        `/guest/doors_images/${door.name.replace(/\s+/g, "_")}.png`}
      alt={activePhoto?.alt || translatedName}
      class="door-photo w-44 h-44 object-cover rounded-2xl border-2 border-slate-200 shadow-lg"
      onerror={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        if (img.src.includes("default_door.png")) {
          // Prevent infinite loop - if default image also fails, remove onerror handler
          img.onerror = null;
          return;
        }
        img.src = "/guest/default_door.png";
      }}
    />
    <div
      class="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/10 to-transparent pointer-events-none"
    ></div>
  </div>
  {#if (door.photos?.length ?? 0) > 1}<div
      class="flex justify-center flex-wrap gap-2"
      aria-label={guestText("photo")}
    >
      {#each door.photos as photo (photo.id)}<button
          type="button"
          class="rounded-lg border-2 p-0.5 {photo.id === activePhoto?.id
            ? 'border-emerald-500'
            : 'border-slate-200'}"
          aria-label={`${guestText("photo")}: ${photo.alt || translatedName}`}
          onclick={() => (selectedPhoto = photo.id)}
          ><img
            src={photo.url}
            alt={photo.alt || translatedName}
            class="w-12 h-12 object-cover rounded-md"
          /></button
        >{/each}
    </div>{/if}
  {#if description}<p
      class="text-slate-600 text-sm text-center leading-relaxed"
    >
      {description}
    </p>{/if}
  <!-- warning codice monouso -->
  {#if door.single_use}
    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 w-full">
      <div class="flex items-start gap-3">
        <p class="text-sm text-amber-800 leading-relaxed">
          {t("single_use_message")}
        </p>
      </div>
    </div>
  {/if}

  <!-- pulsante per aprire la porta -->
  <button
    class="group relative w-full bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 text-white font-semibold px-8 py-4 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:shadow-lg flex items-center justify-center gap-3"
    onclick={handleOpen}
    disabled={allButtonsDisabled || doorStatus !== "ready"}
  >
    <svg
      class="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
      ></path>
    </svg>
    <span class="text-lg">{t("open")}</span>
    <div
      class="absolute inset-0 rounded-2xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
    ></div>
  </button>

  <!-- warning pulsante stanza gia usato  -->
  {#if consumed}
    <div class="bg-red-50 border border-red-200 rounded-xl p-4 w-full">
      <div class="flex items-start gap-3">
        <div
          class="w-5 h-5 bg-red-400 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        >
          <svg
            class="w-3 h-3 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="3"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          </svg>
        </div>
        <p class="text-sm text-red-800 font-medium leading-relaxed">
          {t("already_used_message")}
        </p>
      </div>
    </div>
  {/if}

  {#if ["disabled", "paused", "unconfigured", "uncertain"].includes(doorStatus)}<div
      class="bg-amber-50 border border-amber-200 rounded-xl p-4 w-full"
    >
      <p class="text-sm text-amber-800 leading-relaxed">
        {guestText(doorStatus)}
      </p>
    </div>{/if}

  <!-- date di validita' -->
  {#if door.times.from && door.times.to && !consumed}
    <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 w-full">
      <div class="text-center space-y-3">
        {#if expired}
          <div class="bg-red-100 border border-red-200 rounded-lg p-3">
            <div class="flex items-center justify-center gap-2">
              <div
                class="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"
              >
                <svg
                  class="w-2.5 h-2.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    d="M6 18L18 6M6 6l12 12"
                  ></path>
                </svg>
              </div>
              <span class="text-red-700 font-semibold text-sm"
                >{t("button_expired")}</span
              >
            </div>
          </div>
        {/if}
        {#if not_yet_valid}
          <div class="bg-orange-100 border border-orange-200 rounded-lg p-3">
            <div class="flex items-center justify-center gap-2">
              <div
                class="w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center"
              >
                <svg
                  class="w-2.5 h-2.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    d="M12 9v2m0 4h.01"
                  ></path>
                </svg>
              </div>
              <span class="text-orange-700 font-semibold text-sm"
                >{t("button_not_yet_valid")}</span
              >
            </div>
          </div>
        {/if}

        <div class="text-center">
          <p class="text-sm font-medium text-slate-700 mb-2">
            {t("button_valid")}
          </p>
          <div class="space-y-2">
            <div class="flex items-center justify-center gap-2">
              <span class="text-slate-600">{t("from")}:</span>
              <span class="font-medium text-slate-800"
                >{formatDateTime(valid_from, timezone)}</span
              >
            </div>
            <div class="flex items-center justify-center gap-2">
              <span class="text-slate-600">{t("to")}:</span>
              <span class="font-medium text-slate-800"
                >{formatDateTime(valid_to, timezone)}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</article>

{#if showModal}
  <dialog
    open
    class="fixed inset-0 m-0 w-full max-w-none h-full max-h-none bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 border-0 p-4"
    aria-label={message}
    oncancel={(e) => {
      e.preventDefault();
      dismiss();
    }}
  >
    <div
      class="bg-white rounded-2xl p-8 shadow-2xl text-center max-w-sm animate-fade-in border border-slate-200"
    >
      <div
        class="w-16 h-16 bg-gradient-to-r {outcome === 'accepted'
          ? 'from-emerald-400 to-cyan-500'
          : outcome === 'uncertain'
            ? 'from-amber-400 to-orange-500'
            : 'from-red-400 to-red-500'} rounded-full flex items-center justify-center mx-auto mb-4"
      >
        <svg
          class="w-8 h-8 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d={outcome === "accepted"
              ? "M5 13l4 4L19 7"
              : "M12 9v2m0 4h.01M4 4l16 16M20 4L4 20"}
          ></path></svg
        >
      </div>
      <p class="text-xl font-semibold text-slate-800 mb-2" role="status">
        {message}
      </p>
      {#if outcome === "accepted"}<p class="text-sm text-slate-600">
          Page will refresh automatically...
        </p>{:else}<button
          class="mt-4 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl"
          onclick={dismiss}>{t("cancel")}</button
        >{/if}
    </div>
  </dialog>
{/if}

<style>
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-fade-in {
    animation: fade-in 0.2s ease-out forwards;
  }
</style>
