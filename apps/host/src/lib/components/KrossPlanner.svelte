<script lang="ts">
  import {
    endOfMonth,
    parseDate,
    startOfMonth,
    today,
  } from "@internationalized/date";
  import { CalendarDays, ChevronLeft, ChevronRight } from "@lucide/svelte";
  import { untrack } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { RangeCalendar } from "$lib/components/ui/range-calendar";
  import CalendarDialog from "./CalendarDialog.svelte";
  import { hostLanguage } from "$lib/i18n.svelte";
  import { formatDisplayDate } from "$lib/date-settings.svelte";
  import type { KrossPlanner } from "../../../../../shared/connectors";

  type Stay = KrossPlanner["reservations"][number];
  let {
    timezone,
    loadRange,
    onReview,
    pending,
  }: {
    timezone: string;
    loadRange: (start: string, end: string) => Promise<KrossPlanner>;
    onReview: (stay: Stay) => void;
    pending: boolean;
  } = $props();
  const l = (en: string, it: string) =>
    hostLanguage.current === "it" ? it : en;
  const currentDate = $derived(today(timezone).toString());
  let range = $state(
    untrack(() => ({
      start: currentDate,
      end: endOfMonth(parseDate(currentDate)).toString(),
    })),
  );
  let open = $state(false);
  const first = $derived(parseDate(range.start));
  const dayCount = $derived(
    (Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1,
  );
  const dateLabel = $derived(
    formatDisplayDate(range.start) + " – " + formatDisplayDate(range.end),
  );
  const days = $derived.by(() => {
    const weekday = new Intl.DateTimeFormat(hostLanguage.current, {
      weekday: "short",
      timeZone: "UTC",
    });
    return Array.from({ length: dayCount }, (_, i) => {
      const d = first.add({ days: i });
      const jsDate = d.toDate("UTC");
      return {
        iso: d.toString(),
        number: jsDate.toLocaleDateString(hostLanguage.current, {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
        weekday: weekday.format(jsDate),
        weekend: [0, 6].includes(jsDate.getUTCDay()),
      };
    });
  });
  let request = $derived(loadRange(range.start, range.end));

  function roomRows(data: KrossPlanner) {
    const start = first.toString();
    const end = parseDate(range.end).add({ days: 1 }).toString();
    const stays = new Map<
      string,
      { stay: Stay; start: number; end: number }[]
    >();
    for (const stay of data.reservations) {
      if (stay.arrival >= end || stay.departure <= start) continue;
      const dayColumn = (iso: string) =>
        1 + (Date.parse(iso) - Date.parse(start)) / 86400000;
      const startDay = Math.max(1, dayColumn(stay.arrival));
      const endDay = Math.min(dayCount + 1, dayColumn(stay.departure));
      if (endDay <= startDay) continue;
      const entries = stays.get(stay.roomId) ?? [];
      entries.push({ stay, start: startDay, end: endDay });
      stays.set(stay.roomId, entries);
    }
    return data.rooms.map((room) => ({
      room,
      stays: stays.get(room.id) ?? [],
    }));
  }

  function moveMonth(step: number) {
    const month = startOfMonth(first.add({ months: step }));
    range = { start: month.toString(), end: endOfMonth(month).toString() };
  }
</script>

<section class="min-w-0" aria-label={l("Room planner", "Planner camere")}>
  <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
    <h3 class="font-semibold">{l("Room planner", "Planner camere")}</h3>
    <div class="flex flex-wrap items-center gap-1">
      <Button
        size="icon"
        disabled={pending}
        variant="ghost"
        aria-label={l("Previous month", "Mese precedente")}
        onclick={() => moveMonth(-1)}><ChevronLeft /></Button
      >
      <CalendarDialog
        bind:open
        disabled={pending}
        title={l("Choose date range", "Scegli intervallo")}
        label={l("Choose date range", "Scegli intervallo") + " · " + dateLabel}
      >
        {#snippet trigger()}<CalendarDays />{dateLabel}{/snippet}
        <RangeCalendar
          value={{ start: first, end: parseDate(range.end) }}
          locale={hostLanguage.current}
          weekStartsOn={1}
          captionLayout="dropdown"
          preventDeselect
          onValueChange={(value) => {
            if (value.start && value.end) {
              range = {
                start: value.start.toString(),
                end: value.end.toString(),
              };
              open = false;
            }
          }}
        />
        <Button
          variant="ghost"
          onclick={() => {
            range = {
              start: currentDate,
              end: endOfMonth(parseDate(currentDate)).toString(),
            };
            open = false;
          }}>{l("Today to month end", "Da oggi a fine mese")}</Button
        >
      </CalendarDialog>
      <Button
        size="icon"
        disabled={pending}
        variant="ghost"
        aria-label={l("Next month", "Mese successivo")}
        onclick={() => moveMonth(1)}><ChevronRight /></Button
      >
    </div>
  </div>

  {#await request}
    <p
      role="status"
      class="rounded-lg border p-4 text-sm text-muted-foreground"
    >
      {l("Loading planner…", "Caricamento planner…")}
    </p>
  {:then data}
    {#if data.rooms.length}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users can scroll across the month even when there are no bookings) -->
      <div
        class="planner-scroll"
        role="region"
        aria-label={l(
          "Room availability by day",
          "Disponibilità delle camere per giorno",
        )}
        tabindex="0"
      >
        <div class="sheet" style:--days={dayCount}>
          <div class="head band">
            <div class="room-name room-head">{l("Room", "Camera")}</div>
            <div class="dates tracks">
              {#each days as day (day.iso)}
                <div
                  class={[
                    "day",
                    {
                      weekend: day.weekend,
                      "selected-day": day.iso === currentDate,
                    },
                  ]}
                  data-date={day.iso}
                  aria-current={day.iso === currentDate ? "date" : undefined}
                >
                  <span>{day.weekday}</span><strong>{day.number}</strong>
                </div>
              {/each}
            </div>
          </div>
          {#each roomRows(data) as row (row.room.id)}
            <div class="band">
              <div
                class="room-name"
                style:--room-color={row.room.color}
                title={row.room.name}
              >
                {row.room.name}
              </div>
              <div class="stays tracks">
                {#each row.stays as bar, i (i)}
                  {@const stay = bar.stay}
                  {@const label =
                    stay.label ||
                    (stay.blockId
                      ? l("Room blocked", "Camera bloccata")
                      : l("Reservation", "Prenotazione") +
                        " " +
                        stay.id_reservation)}
                  {@const description =
                    label +
                    " · " +
                    row.room.name +
                    " · " +
                    formatDisplayDate(stay.arrival) +
                    " → " +
                    formatDisplayDate(stay.departure)}
                  {#if stay.blockId}
                    <span
                      class="booking blocked"
                      style:grid-column={bar.start + " / " + bar.end}
                      style:grid-row={stay.row}
                      style:--booking-color={stay.color}
                      style:--booking-text={stay.textColor}
                      title={description}>{label}</span
                    >
                  {:else}
                    <button
                      data-slot="planner-booking"
                      class="booking"
                      type="button"
                      style:grid-column={bar.start + " / " + bar.end}
                      style:grid-row={stay.row}
                      style:--booking-color={stay.color}
                      style:--booking-text={stay.textColor}
                      disabled={pending}
                      title={description}
                      aria-label={description}
                      onclick={() => onReview(stay)}>{label}</button
                    >
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
      {#if !data.reservations.length}
        <p role="status" class="mt-2 text-sm text-muted-foreground">
          {l(
            "No reservations in this range.",
            "Nessuna prenotazione in questo intervallo.",
          )}
        </p>
      {/if}
    {:else}
      <p
        role="status"
        class="rounded-lg border p-4 text-sm text-muted-foreground"
      >
        {l(
          "No rooms returned for this property.",
          "Nessuna camera trovata per questa struttura.",
        )}
      </p>
    {/if}
  {:catch error}
    <div
      role="alert"
      class="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
    >
      <span class="text-sm"
        >{error instanceof Error
          ? error.message
          : l(
              "Could not load planner.",
              "Impossibile caricare il planner.",
            )}</span
      >
      <Button
        variant="outline"
        onclick={() => (request = loadRange(range.start, range.end))}
        >{l("Retry", "Riprova")}</Button
      >
    </div>
  {/await}
</section>

<style>
  .planner-scroll {
    --room-width: clamp(7.5rem, 20vw, 15rem);
    --day-width: clamp(5.5rem, 8vw, 8rem);
    overflow: auto;
    max-height: 65dvh;
    overscroll-behavior: contain;
    border-top: 1px solid var(--border);
    position: relative;
    isolation: isolate;
  }
  .sheet {
    width: max-content;
    min-width: 100%;
  }
  .band {
    display: flex;
    border-bottom: 1px solid var(--border);
  }
  .band:last-child {
    border-bottom: 0;
  }
  .head {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--card);
  }
  .room-name {
    display: flex;
    align-items: center;
    position: sticky;
    left: 0;
    z-index: 1;
    width: var(--room-width);
    flex: none;
    padding: 0.45rem 0.65rem;
    background: var(--card);
    border-right: 1px solid var(--border);
    font-size: 0.8rem;
    font-weight: 600;
    overflow-wrap: anywhere;
    box-shadow: inset 3px 0 var(--room-color, transparent);
  }
  .room-head {
    background: var(--muted);
  }
  .tracks {
    display: grid;
    grid-template-columns: repeat(var(--days), var(--day-width));
  }
  .day {
    display: grid;
    justify-items: center;
    padding-block: 0.35rem;
    border-right: 1px solid var(--border);
    font-size: 0.7rem;
    color: var(--muted-foreground);
  }
  .day strong {
    color: var(--foreground);
    font-size: 0.86rem;
  }
  .weekend {
    background: var(--muted);
  }
  .selected-day {
    box-shadow: inset 0 -3px var(--primary);
  }
  .stays {
    grid-auto-flow: row dense;
    min-height: 2.8rem;
    align-content: center;
    padding: 0.25rem 0;
    row-gap: 0.15rem;
    background: repeating-linear-gradient(
      to right,
      transparent 0 calc(var(--day-width) - 1px),
      var(--border) calc(var(--day-width) - 1px) var(--day-width)
    );
  }
  .booking {
    min-width: 0;
    margin-inline: 2px;
    overflow: hidden;
    padding: 0.3rem 0.45rem;
    border: 1px solid color-mix(in srgb, var(--primary) 25%, var(--card));
    border-inline-start: 3px solid var(--primary);
    border-radius: 0.35rem;
    background: var(--booking-color, var(--secondary));
    color: var(--booking-text, var(--secondary-foreground));
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: left;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .booking:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
  button.booking:hover {
    filter: brightness(0.94);
  }
  .blocked {
    cursor: default;
    border-inline-start-style: dashed;
  }
  .booking:disabled {
    cursor: wait;
  }
</style>
