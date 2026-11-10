<script lang="ts">
  import { Switch as SwitchPrimitive } from "bits-ui";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    checked = $bindable(false),
    size = "default",
    ...restProps
  }: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
    size?: "sm" | "default";
  } = $props();
</script>

<SwitchPrimitive.Root
  bind:ref
  bind:checked
  data-slot="switch"
  data-size={size}
  class={cn(
    "data-[state=checked]:bg-[#34c759] data-[state=unchecked]:bg-neutral-200 dark:data-[state=unchecked]:bg-neutral-700 focus-visible:ring-ring/50 shrink-0 rounded-full border-0 p-0.5 focus-visible:ring-3 data-[size=default]:h-[26px] data-[size=default]:w-[44px] data-[size=sm]:h-[22px] data-[size=sm]:w-[36px] peer group/switch relative inline-flex items-center transition-colors duration-200 outline-none after:absolute after:-inset-x-1 after:-inset-y-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",

    className,
  )}
  {...restProps}
>
  <SwitchPrimitive.Thumb
    data-slot="switch-thumb"
    class={cn(
      "bg-white rounded-full group-data-[size=default]/switch:size-[22px] group-data-[size=sm]/switch:size-[18px] group-data-[size=default]/switch:data-[state=checked]:translate-x-[18px] group-data-[size=sm]/switch:data-[state=checked]:translate-x-[14px] data-[state=unchecked]:translate-x-0 pointer-events-none block shadow-sm transition-transform duration-200 ease-out",
      "rtl:group-data-[size=default]/switch:data-[state=checked]:-translate-x-[18px] rtl:group-data-[size=sm]/switch:data-[state=checked]:-translate-x-[14px]",
    )}
  />
</SwitchPrimitive.Root>
