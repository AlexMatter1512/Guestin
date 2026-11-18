<script lang="ts">
  import { formatDisplayDate } from "$lib/date-settings.svelte";
  import { parseDate } from "@internationalized/date";
  import * as Calendar from "$lib/components/ui/calendar";
  import CalendarDialog from "./CalendarDialog.svelte";
  import { CalendarDays } from "@lucide/svelte";
  import { hostLanguage, t } from "$lib/i18n.svelte";
  let {
    value,
    hasCodes,
    onchange,
  }: {
    value: string;
    hasCodes: (date: string) => boolean;
    onchange: (date: string) => void;
  } = $props();
  let open = $state(false);
  const selected = $derived(parseDate(value));
  const label = $derived(formatDisplayDate(value));
</script>

<CalendarDialog
  bind:open
  title={t("Valid on date")}
  label={t("Valid on date") + ": " + label}
  variant="ghost"
  triggerClass="date-picker-trigger"
>
  {#snippet trigger()}<CalendarDays size={17} /><span>{label}</span>{/snippet}
  <Calendar.Calendar
    type="single"
    value={selected}
    locale={hostLanguage.current}
    weekStartsOn={1}
    preventDeselect
    onValueChange={(day) => {
      if (day) {
        onchange(day.toString());
        open = false;
      }
    }}
  >
    {#snippet day({ day })}
      <Calendar.Day
        class="relative"
        aria-label={day.toString() +
          (hasCodes(day.toString()) ? " · " + t("Access codes") : "")}
      >
        {#snippet children({ day: number })}
          {number}
          {#if hasCodes(day.toString())}<span
              data-code-dot
              class="absolute bottom-1 size-1 rounded-full bg-current"
              aria-hidden="true"
            ></span>{/if}
        {/snippet}
      </Calendar.Day>
    {/snippet}
  </Calendar.Calendar>
  <p class="px-2 pb-1 text-xs text-muted-foreground">
    {hostLanguage.current === "it"
      ? "• Date con codici di accesso"
      : "• Dates with access codes"}
  </p>
</CalendarDialog>
