<script lang="ts">
  import { onDestroy } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { t } from "$lib/i18n.svelte";
  import { propertyLogoSchema } from "../../../../../shared/guest-page";

  let {
    value = $bindable<string | null>(null),
    processing = $bindable(false),
    disabled = false,
  }: {
    value?: string | null;
    processing?: boolean;
    disabled?: boolean;
  } = $props();
  let error = $state("");
  let active = true;
  onDestroy(() => {
    active = false;
  });

  async function upload(file: File) {
    error = "";
    processing = true;
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw Error(t("Choose a PNG, JPEG or WebP image under 10 MB."));
      const bitmap = await createImageBitmap(file);
      try {
        if (!active) return;
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw Error(t("Could not process this logo."));
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const image = propertyLogoSchema.safeParse(
          canvas.toDataURL("image/webp", 0.84),
        );
        if (!image.success) throw Error(t("Could not process this logo."));
        value = image.data;
      } finally {
        bitmap.close();
      }
    } catch {
      if (active)
        error = t(
          "Could not upload this logo. Choose a PNG, JPEG or WebP image under 10 MB.",
        );
    } finally {
      if (active) processing = false;
    }
  }
</script>

<div class="stack">
  <Label for="property-logo">{t("Upload property logo")}</Label>
  {#if value}
    <div class="row">
      <img
        src={value}
        alt={t("Property logo")}
        class="h-16 max-w-36 object-contain"
      />
      <Button
        type="button"
        variant="outline"
        {disabled}
        onclick={() => (value = null)}>{t("Remove logo")}</Button
      >
    </div>
  {/if}
  <Input
    id="property-logo"
    type="file"
    accept="image/png,image/jpeg,image/webp"
    disabled={disabled || processing}
    onchange={(event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      input.value = "";
      if (file) void upload(file);
    }}
  />
  {#if error}<p role="alert" class="error">{error}</p>{/if}
</div>
