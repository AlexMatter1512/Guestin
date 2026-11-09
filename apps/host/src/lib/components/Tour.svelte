<script lang="ts">
  import { tick } from "svelte";
  import { t } from "$lib/i18n.svelte";
  let {
    open,
    stage,
    title,
    text,
    target,
    onfinish,
  }: {
    open: boolean;
    stage: string;
    title: string;
    text: string;
    target: string;
    onfinish: (result: "completed" | "skipped") => void;
  } = $props();
  const step = $derived(
    stage === "property" ? 1 : stage === "door" ? 2 : stage === "code" ? 3 : 4,
  );
  type Spotlight = { left: number; top: number; width: number; height: number };
  let spotlight = $state<Spotlight | null>(null);

  $effect(() => {
    const selector = target;
    if (!open) return;
    let cancelled = false;
    let frame = 0;
    let element: HTMLElement | null = null;
    const resize = new ResizeObserver(scheduleMeasure);
    const mutations = new MutationObserver(scheduleMeasure);

    function removeHighlight() {
      element?.classList.remove("tour-highlight");
      element?.removeAttribute("data-tour-highlighted");
      if (element) resize.unobserve(element);
    }
    function measure() {
      frame = 0;
      if (cancelled) return;
      const next = selector
        ? document.querySelector<HTMLElement>(selector)
        : null;
      if (next !== element) {
        removeHighlight();
        element = next;
        if (element) {
          element.classList.add("tour-highlight");
          element.setAttribute("data-tour-highlighted", "true");
          resize.observe(element);
          if (!element.closest(".app-nav"))
            element.scrollIntoView({
              block:
                element.tagName === "FORM" || element.tagName === "ARTICLE"
                  ? "start"
                  : "center",
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            });
        }
      }
      if (!element || !element.getClientRects().length) {
        spotlight = null;
        return;
      }
      const bounds = element.getBoundingClientRect();
      const padding = 9;
      // Coordinates remain in viewport space, including tall forms while the
      // guest scrolls. The cutout follows scroll, resizing and DOM changes.
      spotlight = {
        left: bounds.left - padding,
        top: bounds.top - padding,
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
      };
    }
    function scheduleMeasure() {
      if (!cancelled && !frame) frame = requestAnimationFrame(measure);
    }

    void tick().then(() => {
      if (cancelled) return;
      resize.observe(document.body);
      mutations.observe(document.body, { childList: true, subtree: true });
      window.addEventListener("scroll", scheduleMeasure, true);
      window.addEventListener("resize", scheduleMeasure);
      window.visualViewport?.addEventListener("resize", scheduleMeasure);
      window.visualViewport?.addEventListener("scroll", scheduleMeasure);
      measure();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasure);
      removeHighlight();
    };
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if (open && e.key === "Escape") {
      e.preventDefault();
      onfinish("skipped");
    }
  }}
/>
{#if open && spotlight}
  <div
    class="tour-spotlight"
    data-tour-spotlight
    aria-hidden="true"
    style:left={`${spotlight.left}px`}
    style:top={`${spotlight.top}px`}
    style:width={`${spotlight.width}px`}
    style:height={`${spotlight.height}px`}
  ></div>
{/if}
{#if open}<section class="guided-setup" aria-label={t("Guided setup")}>
    <div class="guide-top">
      <span>{t("GUIDED SETUP")} · {Math.min(step, 3)} / 3</span><button
        class="quiet"
        onclick={() => onfinish("skipped")}>{t("Skip tour")}</button
      >
    </div>
    <div aria-live="polite" aria-atomic="true">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
    {#if stage === "done"}<button
        class="primary"
        onclick={() => onfinish("completed")}>{t("Finish setup")}</button
      >{:else}<small
        >{t(
          "Follow the highlighted part of the app. You can skip whenever you like.",
        )}</small
      >{/if}
  </section>{/if}

<style>
  .tour-spotlight {
    position: fixed;
    z-index: 40;
    border-radius: 12px;
    box-shadow: 0 0 0 200vmax rgb(20 27 32 / 62%);
    pointer-events: none;
  }
  .guided-setup {
    position: sticky;
    top: 8px;
    z-index: 50;
    isolation: isolate;
    background: var(--muted);
    color: var(--foreground);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 18px 20px;
    margin-bottom: 24px;
    box-shadow: 0 3px 15px #1e59480a;
  }
  .guide-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    margin-bottom: 8px;
  }
  .guide-top span {
    font-size: 10px;
    letter-spacing: 1.2px;
    font-weight: 700;
    color: var(--muted-foreground);
  }
  .guide-top button {
    padding: 5px 8px;
    font-size: 12px;
    color: var(--foreground);
    background: var(--background);
    white-space: nowrap;
  }
  .guided-setup h2 {
    font-size: 19px;
    margin: 0 0 8px;
    letter-spacing: -0.3px;
  }
  .guided-setup p {
    font-size: 14px;
    line-height: 1.6;
    margin: 0 0 9px;
    color: var(--foreground);
  }
  .guided-setup small {
    font-size: 11px;
    color: var(--muted-foreground);
  }
  .guided-setup > .primary {
    font-size: 13px;
    margin-top: calc(68px + env(safe-area-inset-top));
  }
  :global(:root[data-theme="dark"]) .guided-setup {
    color: var(--foreground);
    background: var(--muted);
    border-color: var(--border);
    box-shadow: 0 3px 15px #0003;
  }
  :global(:root[data-theme="dark"]) .guided-setup p {
    color: var(--foreground);
  }
  :global(:root[data-theme="dark"]) .guided-setup small,
  :global(:root[data-theme="dark"]) .guide-top span {
    color: var(--muted-foreground);
  }
  :global(:root[data-theme="dark"]) .guide-top button {
    color: var(--foreground);
    background: var(--background);
    border-color: var(--border);
  }
  :global(:root[data-theme="dark"]) .guide-top button:hover {
    background: var(--secondary);
  }
  @media (max-width: 760px) {
    .guided-setup {
      top: calc(68px + env(safe-area-inset-top));
      padding: 14px 16px;
      margin-bottom: 20px;
    }
    .guided-setup h2 {
      font-size: 18px;
    }
    .guided-setup p {
      font-size: 13px;
      line-height: 1.5;
    }
  }
</style>
