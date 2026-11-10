<script lang="ts">
  import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: RangeCalendarPrimitive.GridProps = $props();
</script>

<RangeCalendarPrimitive.Grid
  data-slot="range-calendar-grid"
  bind:ref
  class={cn("flex w-full border-collapse flex-col", className)}
  {...restProps}
/>
