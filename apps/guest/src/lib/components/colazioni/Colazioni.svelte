<script lang="ts">
  import { onDestroy } from "svelte";
  import { t } from "$lib/i18n/translations";
  type Breakfast = { total: number; start: string; end: string };
  let {
    remaining_colazioni,
    breakfast,
    today,
    timezone,
    onRedeem,
    onSuccessDismiss = () => {},
  }: {
    remaining_colazioni: number;
    breakfast: Breakfast;
    today: string;
    timezone: string;
    onRedeem: (quantity: number) => Promise<void>;
    onSuccessDismiss?: () => void;
  } = $props();
  let selectedToUse = $state(0),
    message = $state(""),
    showModal = $state(false),
    showConfirmModal = $state(false),
    pending = $state(false),
    succeeded = $state(false);
  let errorDetails = $state<{
    currentDate: string;
    allowedStart: string;
    allowedEnd: string;
  } | null>(null);
  let confirmDialog = $state<HTMLDialogElement>(),
    periodDialog = $state<HTMLDialogElement>(),
    feedbackDialog = $state<HTMLDialogElement>();
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const canUseBreakfast = $derived(
    today >= breakfast.start && today <= breakfast.end,
  );
  $effect(() => {
    if (selectedToUse > remaining_colazioni)
      selectedToUse = Math.max(0, remaining_colazioni);
  });
  $effect(() => {
    if (showConfirmModal && confirmDialog && !confirmDialog.open)
      confirmDialog.showModal();
  });
  $effect(() => {
    if (errorDetails && periodDialog && !periodDialog.open)
      periodDialog.showModal();
  });
  $effect(() => {
    if (showModal && feedbackDialog && !feedbackDialog.open)
      feedbackDialog.showModal();
  });
  onDestroy(() => clearTimeout(closeTimer));
  function showConfirmation() {
    clearTimeout(closeTimer);
    if (!pending && selectedToUse > 0 && selectedToUse <= remaining_colazioni)
      showConfirmModal = true;
  }
  function cancelUse() {
    if (!pending) showConfirmModal = false;
  }
  function increment() {
    if (!pending && selectedToUse < remaining_colazioni) selectedToUse++;
  }
  function decrement() {
    if (!pending && selectedToUse > 0) selectedToUse--;
  }
  function setMax() {
    if (!pending) selectedToUse = remaining_colazioni;
  }
  function closeErrorModal() {
    errorDetails = null;
    showModal = false;
  }
  async function confirmUse() {
    if (pending || selectedToUse <= 0 || selectedToUse > remaining_colazioni)
      return;
    showConfirmModal = false;
    if (!canUseBreakfast) {
      errorDetails = {
        currentDate: today,
        allowedStart: breakfast.start,
        allowedEnd: breakfast.end,
      };
      return;
    }
    const quantity = selectedToUse;
    pending = true;
    succeeded = false;
    try {
      await onRedeem(quantity);
      selectedToUse = 0;
      succeeded = true;
      message = `✅ ${t("used")} ${quantity} ${t("colazioni")} ${t("successfully")}`;
      showModal = true;
      closeTimer = setTimeout(() => {
        showModal = false;
        onSuccessDismiss();
      }, 3000);
    } catch (e) {
      if (!canUseBreakfast || (e as any)?.code === "USAGE_PERIOD_INVALID")
        errorDetails = {
          currentDate: today,
          allowedStart: breakfast.start,
          allowedEnd: breakfast.end,
        };
      else {
        message = `❌ ${t("error")}: ${e instanceof Error ? e.message : t("error_generic_message")}`;
        showModal = true;
      }
    } finally {
      pending = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Colazioni selector (only when usage period info is NOT shown) -->
  {#if canUseBreakfast}
    <div class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
      <!-- Main Action Button -->
      <button
        onclick={showConfirmation}
        disabled={selectedToUse <= 0 ||
          pending ||
          showModal ||
          showConfirmModal}
        class="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-slate-400 disabled:to-slate-500 text-white font-bold py-4 px-6 rounded-xl disabled:opacity-50 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center space-x-3 mb-6"
      >
        <span class="text-lg">
          {#if selectedToUse > 0}
            {t("use")} {selectedToUse} {t("colazioni")}
          {:else}
            {t("select_amount_to_use")}
          {/if}
        </span>
      </button>

      <!-- Counter Section -->
      <div class="flex items-center justify-center space-x-4 mb-6">
        <button
          onclick={decrement}
          disabled={selectedToUse <= 0 || pending}
          class="w-12 h-12 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:bg-slate-300 flex items-center justify-center text-white shadow-md hover:shadow-lg transition-all duration-200"
          aria-label={t("decrease_colazioni")}
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="3"
              d="M20 12H4"
            ></path>
          </svg>
        </button>

        <div
          class="w-20 h-16 bg-slate-50 rounded-2xl border-2 border-slate-300 flex items-center justify-center shadow-inner"
        >
          <span class="text-3xl font-bold text-slate-800">{selectedToUse}</span>
        </div>

        <button
          onclick={increment}
          disabled={selectedToUse >= remaining_colazioni || pending}
          class="w-12 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:bg-slate-300 flex items-center justify-center text-white shadow-md hover:shadow-lg transition-all duration-200"
          aria-label={t("increase_colazioni")}
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="3"
              d="M12 4v16m8-8H4"
            ></path>
          </svg>
        </button>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-center space-x-3">
        <button
          onclick={() => (selectedToUse = 0)}
          class="px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl disabled:opacity-50 transition-all duration-200"
          disabled={selectedToUse === 0 || pending}
        >
          {t("clear")}
        </button>
        <button
          onclick={setMax}
          class="px-4 py-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl disabled:opacity-50 shadow-md hover:shadow-lg transition-all duration-200"
          disabled={pending ||
            remaining_colazioni === 0 ||
            selectedToUse === remaining_colazioni}
        >
          {t("max")}
        </button>
      </div>

      <!-- Status Messages -->
      {#if remaining_colazioni === 0}
        <div
          class="bg-red-50 border border-red-200 rounded-xl p-4 mt-6 text-center"
        >
          <p class="text-red-700 font-bold">{t("no_colazioni_remaining")}</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if showConfirmModal}
  <dialog
    bind:this={confirmDialog}
    aria-label={t("confirm_use")}
    oncancel={(e) => {
      e.preventDefault();
      cancelUse();
    }}
    class="fixed inset-0 m-0 h-full w-full max-w-none max-h-none p-0 border-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
  >
    <div
      class="bg-white rounded-2xl p-8 shadow-2xl text-center max-w-md border border-slate-200"
    >
      <div
        class="w-16 h-16 bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl flex items-center justify-center mx-auto mb-6"
      >
        <svg
          class="w-8 h-8 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
      </div>
      <h3 class="text-xl font-bold text-slate-800 mb-4">
        {t("confirm_use")}
      </h3>
      <p class="text-slate-600 mb-6 text-lg">
        {t("confirm_use_message")}
        <span class="font-bold text-slate-800"
          >{selectedToUse} {t("colazioni")}</span
        >?
      </p>

      <div class="flex space-x-4">
        <button
          onclick={cancelUse}
          class="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-all duration-200"
        >
          {t("cancel")}
        </button>
        <button
          onclick={confirmUse}
          disabled={pending}
          class="flex-1 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-slate-400 disabled:to-slate-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50"
        >
          {t("confirm")}
        </button>
      </div>
    </div>
  </dialog>
{/if}

{#if errorDetails}
  <!-- Period Error Modal -->
  <dialog
    bind:this={periodDialog}
    aria-label={t("usage_period_error")}
    oncancel={(e) => {
      e.preventDefault();
      closeErrorModal();
    }}
    class="fixed inset-0 m-0 h-full w-full max-w-none max-h-none p-0 border-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
  >
    <div
      class="bg-white rounded-2xl p-8 shadow-2xl max-w-lg border border-slate-200"
    >
      <div class="text-center mb-6">
        <div
          class="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4"
        >
          <svg
            class="w-8 h-8 text-orange-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
        </div>
        <h3 class="text-xl font-bold text-slate-800 mb-3">
          {t("usage_period_error")}
        </h3>
        <p class="text-slate-600">{t("usage_period_explanation")}</p>
      </div>

      <div class="bg-slate-50 rounded-xl p-6 mb-6 space-y-4">
        {#if errorDetails.currentDate}
          <div class="flex justify-between items-center">
            <span class="text-slate-600 font-medium">{t("current_date")}:</span>
            <span class="font-bold text-slate-800"
              >{errorDetails.currentDate}</span
            >
          </div>
        {/if}
        {#if errorDetails.allowedStart && errorDetails.allowedEnd}
          <div class="flex justify-between items-center">
            <span class="text-slate-600 font-medium"
              >{t("usage_period_allowed")}:</span
            >
            <span class="font-bold text-slate-800"
              >{errorDetails.allowedStart} - {errorDetails.allowedEnd}</span
            >
          </div>
        {/if}
      </div>

      <div class="text-center mb-6">
        {#if errorDetails.currentDate && errorDetails.allowedStart}
          {#if errorDetails.currentDate < errorDetails.allowedStart}
            <div class="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p class="text-orange-700 font-bold">{t("period_too_early")}</p>
            </div>
          {:else if errorDetails.currentDate > errorDetails.allowedEnd}
            <div class="bg-red-50 border border-red-200 rounded-xl p-4">
              <p class="text-red-700 font-bold">{t("period_too_late")}</p>
            </div>
          {:else}
            <div class="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p class="text-orange-700 font-bold">
                {t("period_unavailable")}
              </p>
            </div>
          {/if}
        {:else}
          <div class="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <p class="text-orange-700 font-bold">{t("period_unavailable")}</p>
          </div>
        {/if}
      </div>

      <button
        onclick={closeErrorModal}
        class="w-full px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl transition-all duration-200"
      >
        {t("cancel")}
      </button>
    </div>
  </dialog>
{:else if showModal}
  <dialog
    bind:this={feedbackDialog}
    aria-label={message}
    oncancel={(e) => {
      e.preventDefault();
      clearTimeout(closeTimer);
      showModal = false;
      if (succeeded) onSuccessDismiss();
    }}
    class="fixed inset-0 m-0 h-full w-full max-w-none max-h-none p-0 border-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
  >
    <div
      class="bg-white rounded-2xl p-8 shadow-2xl text-center max-w-sm border border-slate-200"
    >
      <div
        class="w-16 h-16 bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-6"
      >
        <svg
          class="w-8 h-8 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          ></path>
        </svg>
      </div>
      <p class="text-xl font-bold text-slate-800 mb-4">{message}</p>
      {#if succeeded}<p class="text-slate-600">
          Page will refresh automatically...
        </p>{:else}<button
          onclick={() => (showModal = false)}
          class="mt-2 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl"
          >{t("cancel")}</button
        >{/if}
    </div>
  </dialog>
{/if}

<style>
  dialog::backdrop {
    background: transparent;
  }
</style>
