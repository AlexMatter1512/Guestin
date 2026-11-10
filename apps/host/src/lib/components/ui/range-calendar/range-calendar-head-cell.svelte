<script lang="ts">
  import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: RangeCalendarPrimitive.HeadCellProps = $props();
</script>

<RangeCalendarPrimitive.HeadCell
  data-slot="range-calendar-head-cell"
  bind:ref
  class={cn(
    "w-(--cell-size) rounded-md text-[0.8rem] font-normal text-muted-foreground",
    className,
  )}
  {...restProps}
/>
