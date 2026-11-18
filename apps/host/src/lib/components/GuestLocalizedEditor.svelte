<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import * as NativeSelect from "$lib/components/ui/native-select";
  import GuestMarkdownEditor from "$lib/components/GuestMarkdownEditor.svelte";
  import { t } from "$lib/i18n.svelte";
  import {
    resolveGuestCopy,
    type GuestLocalizedCopy,
  } from "../../../../../shared/guest-page";
  import {
    builtInGuestCopy,
    guestPageLanguages,
    type GuestCopyKind,
    type GuestPageLanguage,
  } from "../../../../../shared/guest-page-copy";

  let {
    id,
    label,
    kind,
    value = $bindable(),
    disabled = false,
  }: {
    id: string;
    label: string;
    kind: GuestCopyKind;
    value: GuestLocalizedCopy;
    disabled?: boolean;
  } = $props();
  let language = $state<GuestPageLanguage>("en");
  const builtIn = $derived(builtInGuestCopy[language][kind]);
  const effective = $derived(resolveGuestCopy(value, kind, language));

  function setTranslation(markdown: string) {
    value = {
      ...value,
      translations: { ...value.translations, [language]: markdown },
    };
  }
</script>

<div class="stack rounded-lg border p-4">
  <div class="flex flex-wrap items-center gap-2">
    <Label for={id + "-language"} class="sr-only"
      >{label} · {t("Language")}</Label
    >
    <NativeSelect.Root id={id + "-language"} bind:value={language}>
      {#each Object.entries(guestPageLanguages) as [code, name] (code)}
        <NativeSelect.Option value={code}>{name}</NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
    {#if value.defaultLanguage === language}
      <span class="text-sm text-muted-foreground">{t("Default language")}</span>
    {:else if !disabled}
      <Button
        type="button"
        variant="ghost"
        onclick={() => (value = { ...value, defaultLanguage: language })}
        >{t("Set as default language")}</Button
      >
    {/if}
  </div>
  {#key language}
    <GuestMarkdownEditor
      {id}
      {label}
      {disabled}
      bind:value={
        () => value.translations[language] ?? effective, setTranslation
      }
    />
  {/key}
  {#if !disabled}
    <div>
      <Button
        type="button"
        variant="outline"
        onclick={() => setTranslation(builtIn)}>{t("Restore default")}</Button
      >
    </div>
  {/if}
</div>
