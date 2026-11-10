<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import { Button } from "$lib/components/ui/button";
  let {
    user,
    api,
  }: { user: any; api: (path: string, body?: any) => Promise<any> } = $props();
  let configured = $state(false),
    busy = $state(false),
    message = $state(""),
    error = $state("");
  onMount(() => {
    void api("mail/status")
      .then((status) => (configured = status.configured))
      .catch(() => {});
  });
  async function send() {
    busy = true;
    error = "";
    try {
      await api("me/verify-email", {});
      message = "Verification email sent. The link expires in 10 minutes.";
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="stack">
  <p>{t(user.emailVerified ? "Email verified" : "Email not verified")}</p>
  {#if configured && !user.emailVerified}<Button
      variant="outline"
      disabled={busy}
      onclick={send}>{t("Send verification email")}</Button
    >
  {:else if !configured}<p class="muted">
      {t(
        "Email delivery is not configured. Ask an owner for password recovery.",
      )}
    </p>{/if}
  {#if message}<p role="status">{t(message)}</p>{/if}
  {#if error}<p class="error" role="alert">{t(error)}</p>{/if}
</div>
