<script lang="ts">
  import { tick } from "svelte";
  import { Bold, Heading, Underline } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Textarea } from "$lib/components/ui/textarea";
  import { t } from "$lib/i18n.svelte";
  import GuestMarkdown from "../../../../../shared/GuestMarkdown.svelte";
  import { guestMarkdownLimit } from "../../../../../shared/guest-page";

  let {
    id,
    label,
    value = $bindable(""),
    disabled = false,
  }: {
    id: string;
    label: string;
    value?: string;
    disabled?: boolean;
  } = $props();
  let preview = $state(false);
  let textarea = $state<HTMLTextAreaElement | null>(null);

  async function format(kind: "heading" | "bold" | "underline") {
    if (!textarea) return;
    let start = textarea.selectionStart;
    let end = textarea.selectionEnd;
    let selectionStart: number;
    let selectionEnd: number;
    let replacement: string;
    if (kind === "heading") {
      start = start > 0 ? value.lastIndexOf("\n", start - 1) + 1 : 0;
      const nextLine = value.indexOf(
        "\n",
        end > start && value[end - 1] === "\n" ? end - 1 : end,
      );
      end = nextLine < 0 ? value.length : nextLine;
      const lines = value.slice(start, end).split("\n");
      const hasHeadings = lines.every((line) => /^#{1,6} /.test(line));
      replacement = lines
        .map((line) =>
          hasHeadings
            ? line.replace(/^#{1,6} /, "")
            : "## " + line.replace(/^#{1,6} /, ""),
        )
        .join("\n");
      selectionStart = selectionEnd = start + replacement.length;
    } else {
      const [before, after] = kind === "bold" ? ["**", "**"] : ["<u>", "</u>"];
      replacement = before + value.slice(start, end) + after;
      selectionStart = start + before.length;
      selectionEnd = selectionStart + end - start;
    }
    const next = value.slice(0, start) + replacement + value.slice(end);
    if (next.length > guestMarkdownLimit) return;
    value = next;
    await tick();
    textarea?.focus();
    textarea?.setSelectionRange(selectionStart, selectionEnd);
  }
</script>

<div class="stack" role="group" aria-labelledby={id + "-label"}>
  <div class="row spread">
    <Label id={id + "-label"} for={preview ? undefined : id}>{label}</Label>
    <Label class="inline" for={id + "-preview"}>
      {t("Preview")}
      <Switch
        id={id + "-preview"}
        bind:checked={preview}
        aria-label={t("Preview") + ": " + label}
      />
    </Label>
  </div>
  {#if preview}
    <div class="min-h-28 rounded-lg border p-3" aria-live="polite">
      {#if value.trim()}<GuestMarkdown source={value} />
      {:else}<p class="muted">
          {t("The built-in message is used when this field is blank.")}
        </p>{/if}
    </div>
  {:else}
    <div class="flex gap-1" role="group" aria-label={t("Formatting")}>
      <Button
        type="button"
        size="icon"
        variant="outline"
        {disabled}
        aria-label={t("Heading")}
        title={t("Heading")}
        onclick={() => format("heading")}><Heading size={17} /></Button
      >
      <Button
        type="button"
        size="icon"
        variant="outline"
        {disabled}
        aria-label={t("Bold")}
        title={t("Bold")}
        onclick={() => format("bold")}><Bold size={17} /></Button
      >
      <Button
        type="button"
        size="icon"
        variant="outline"
        {disabled}
        aria-label={t("Underline")}
        title={t("Underline")}
        onclick={() => format("underline")}><Underline size={17} /></Button
      >
    </div>
    <Textarea
      {id}
      bind:ref={textarea}
      bind:value
      rows={5}
      maxlength={guestMarkdownLimit}
      {disabled}
      placeholder={t("Leave blank to use the built-in message.")}
    />
  {/if}
</div>
