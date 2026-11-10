<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { dateSettings, formatDisplayDate } from "$lib/date-settings.svelte";
  import { parseDisplayDate } from "../../../../../shared/date-format";
  import { hostLanguage } from "$lib/i18n.svelte";
  let {
    value = $bindable(""),
    withTime = false,
    onValueChange,
    ...props
  }: {
    value?: string;
    withTime?: boolean;
    onValueChange?: (value: string) => void;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    class?: string;
  } = $props();
  let text = $derived(
    value
      ? formatDisplayDate(value.slice(0, 10)) +
          (withTime ? " " + value.slice(11, 16) : "")
      : "",
  );
</script>

<Input
  {...props}
  type="text"
  placeholder={dateSettings.format + (withTime ? " HH:mm" : "")}
  value={text}
  autocomplete="off"
  oninput={(event) => {
    const input = event.currentTarget;
    text = input.value;
    const parsed = text
      ? parseDisplayDate(text, dateSettings.format, withTime)
      : "";
    input.setCustomValidity(
      parsed === null
        ? (hostLanguage.current === "it" ? "Usa il formato " : "Use format ") +
            dateSettings.format +
            (withTime ? " HH:mm" : "")
        : "",
    );
    if (parsed !== null) {
      value = parsed;
      onValueChange?.(parsed);
    }
  }}
/>
