<script lang="ts">
  import { parseDate } from "@internationalized/date";
  import * as Calendar from "$lib/components/ui/calendar";
  import * as Popover from "$lib/components/ui/popover";
  import { buttonVariants } from "$lib/components/ui/button";
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
  const label = $derived(
    new Intl.DateTimeFormat(hostLanguage.current, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(value + "T12:00:00Z")),
  );
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class={buttonVariants({ variant: "ghost" }) + " date-picker-trigger"}
    aria-label={t("Valid on date") + ": " + label}
  >
    <CalendarDays size={17} /><span>{label}</span>
  </Popover.Trigger>
  <Popover.Content class="w-auto p-2" align="start">
    <Calendar.Calendar
      type="single"
      value={selected}
      locale={hostLanguage.current}
      weekStartsOn={1}
      preventDeselect
      class="[--cell-size:2.5rem]"
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
  </Popover.Content>
</Popover.Root>
