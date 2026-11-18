<script lang="ts">
  import SvelteMarkdown, { allowHtmlOnly } from "@humanspeak/svelte-markdown";
  import type { SanitizeUrlFn } from "@humanspeak/svelte-markdown";

  let { source }: { source: string } = $props();

  const renderers = { html: allowHtmlOnly(["u"]) };
  const sanitizeUrl: SanitizeUrlFn = (value, context) => {
    if (context.type !== "link") return "";
    try {
      const url = new URL(value);
      return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol)
        ? url.href
        : "";
    } catch {
      return "";
    }
  };
</script>

<div class="guest-markdown">
  <SvelteMarkdown
    {source}
    {renderers}
    {sanitizeUrl}
    sanitizeAttributes={() => ({})}
    options={{ headerIds: false, breaks: true }}
  />
</div>

<style>
  .guest-markdown {
    overflow-wrap: anywhere;
  }
  .guest-markdown :global(h1),
  .guest-markdown :global(h2),
  .guest-markdown :global(h3),
  .guest-markdown :global(h4),
  .guest-markdown :global(h5),
  .guest-markdown :global(h6) {
    font-size: 1.2em;
    font-weight: 650;
    line-height: 1.35;
  }
  .guest-markdown > :global(* + *) {
    margin-top: 0.65em;
  }
  .guest-markdown :global(ul),
  .guest-markdown :global(ol) {
    padding-inline-start: 1.4em;
    text-align: start;
  }
  .guest-markdown :global(ul) {
    list-style: disc;
  }
  .guest-markdown :global(ol) {
    list-style: decimal;
  }
  .guest-markdown :global(a) {
    text-decoration: underline;
  }
  .guest-markdown :global(pre) {
    white-space: pre-wrap;
  }
  .guest-markdown :global(table) {
    display: block;
    overflow-x: auto;
  }
</style>
