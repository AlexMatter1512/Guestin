<script lang="ts">
  import { Calendar as CalendarPrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: CalendarPrimitive.GridProps = $props();
</script>

<CalendarPrimitive.Grid
  data-slot="calendar-grid"
  bind:ref
  class={cn("flex w-full border-collapse flex-col", className)}
  {...restProps}
/>
