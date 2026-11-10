<script lang="ts">
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  let {
    message,
    kind = "success",
  }: { message: string; kind?: "success" | "error" | "info" } = $props();
  $effect(() => {
    const text = message,
      type = kind;
    if (text) untrack(() => toast[type](text));
  });
</script>
