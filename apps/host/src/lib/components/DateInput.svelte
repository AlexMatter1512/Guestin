<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import * as Calendar from "$lib/components/ui/calendar";
  import CalendarDialog from "./CalendarDialog.svelte";
  import { CalendarDays } from "@lucide/svelte";
  import { parseDate } from "@internationalized/date";
  import { dateSettings, formatDisplayDate } from "$lib/date-settings.svelte";
  import { hostLanguage } from "$lib/i18n.svelte";
  import { cn } from "$lib/utils";

  let {
    value = $bindable(""),
    withTime = false,
    onValueChange,
    id,
    label,
    required = false,
    disabled = false,
    class: className,
  }: {
    value?: string;
    withTime?: boolean;
    onValueChange?: (value: string) => void;
    id?: string;
    label?: string;
    required?: boolean;
    disabled?: boolean;
    class?: string;
  } = $props();
  let open = $state(false);
  let triggerButton = $state<HTMLButtonElement | null>(null);
  const selected = $derived(value ? parseDate(value.slice(0, 10)) : undefined);
  const time = $derived(value.slice(11, 16));
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  function change(next: string) {
    value = next;
    onValueChange?.(next);
  }
</script>

<div
  class={cn(
    "date-input relative flex min-w-0 flex-wrap items-center gap-2",
    className,
  )}
>
  <CalendarDialog
    bind:open
    bind:triggerRef={triggerButton}
    {id}
    {disabled}
    title={label || l("Choose date", "Scegli data")}
    triggerClass="min-w-0 flex-1 justify-start font-normal"
  >
    {#snippet trigger()}
      <CalendarDays class="size-4 shrink-0" />
      {value ? formatDisplayDate(value.slice(0, 10)) : dateSettings.format}
    {/snippet}
    <Calendar.Calendar
      type="single"
      value={selected}
      locale={hostLanguage.current}
      weekStartsOn={1}
      preventDeselect
      captionLayout="dropdown"
      onValueChange={(day) => {
        if (!day) return;
        change(day.toString() + (withTime ? "T" + (time || "00:00") : ""));
        open = false;
      }}
    />
    {#if !required && value}
      <Button
        type="button"
        variant="ghost"
        class="w-full"
        onclick={() => {
          change("");
          open = false;
        }}
      >
        {l("Clear date", "Cancella data")}
      </Button>
    {/if}
  </CalendarDialog>
  {#if withTime}
    <Input
      type="time"
      class="w-28 shrink-0"
      aria-label={(label ? label + " · " : "") + l("Time", "Ora")}
      value={time}
      {required}
      {disabled}
      oninput={(event) => {
        if (selected)
          change(selected.toString() + "T" + event.currentTarget.value);
      }}
    />
  {/if}
  <input
    class="sr-only absolute left-0 top-0"
    aria-hidden="true"
    tabindex="-1"
    {value}
    {required}
    {disabled}
    oninvalid={(event) => {
      event.preventDefault();
      triggerButton?.focus();
      open = true;
    }}
  />
</div>
