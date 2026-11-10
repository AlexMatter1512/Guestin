<script lang="ts">
  import { Copy, Ellipsis, ExternalLink, Share2 } from "@lucide/svelte";
  import * as Popover from "$lib/components/ui/popover";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";
  import { hostLanguage, t } from "$lib/i18n.svelte";
  let {
    label,
    link,
    revoked,
    oncopy,
    onshare,
  }: {
    label: string;
    link: string;
    revoked: boolean;
    oncopy: () => void;
    onshare: () => void;
  } = $props();
  let open = $state(false);
</script>

<div class="row row-actions code-row-actions">
  <Button
    type="button"
    variant="ghost"
    size="icon"
    class="code-action-target"
    aria-label={t("Prepare message")}
    title={t("Prepare message")}
    disabled={revoked}
    onclick={onshare}><Share2 size={19} /></Button
  >
  <Popover.Root bind:open>
    <Popover.Trigger
      class={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "code-action-target",
      )}
      aria-label={(hostLanguage.current === "it"
        ? "Altre azioni per "
        : "More actions for ") + label}
      title={hostLanguage.current === "it" ? "Altre azioni" : "More actions"}
      ><Ellipsis size={19} /></Popover.Trigger
    >
    <Popover.Content align="end" class="code-actions-menu">
      <a
        class={cn(buttonVariants({ variant: "ghost" }), "code-menu-action")}
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onclick={() => {
          open = false;
        }}
      >
        <ExternalLink size={18} />{t("Open link")}
      </a>
      <Button
        type="button"
        variant="ghost"
        class="code-menu-action"
        disabled={revoked}
        onclick={() => {
          open = false;
          oncopy();
        }}
      >
        <Copy size={18} />{t("Copy link")}
      </Button>
    </Popover.Content>
  </Popover.Root>
</div>
