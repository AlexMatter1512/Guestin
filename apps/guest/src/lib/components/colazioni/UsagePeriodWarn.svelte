<script lang="ts">
  import { formatDisplayDate } from "$lib/date-settings.svelte";
  import { t } from "$lib/i18n/translations";
  let {
    breakfast,
    today,
    timezone,
  }: {
    breakfast: { total: number; start: string; end: string };
    today: string;
    timezone: string;
  } = $props();
  const period = $derived(
    breakfast.start === breakfast.end
      ? formatDisplayDate(breakfast.start)
      : `${formatDisplayDate(breakfast.start)} - ${formatDisplayDate(breakfast.end)}`,
  );
</script>

<div class="bg-orange-50 border border-orange-200 rounded-2xl p-6 text-center">
  <h4 class="text-xl font-bold text-orange-800">
    {t("colazioni_usage_note")}
  </h4>

  <div class="m-2 p-2 border-b border-orange-200">
    <p class="text-orange-700 font-medium">
      {t("breakfast_not_available_now")}
    </p>
  </div>
  <p class="text-orange-700 mb-4">{t("usage_period_explanation")}</p>
  {#if breakfast.start && breakfast.end}
    <div class="bg-white rounded-xl p-4 border border-orange-200">
      <div>
        <p class="text-slate-600 font-medium">{t("usage_period_allowed")}:</p>
        <p class="font-bold text-slate-800">
          {period}
        </p>
      </div>
    </div>
  {/if}
</div>
