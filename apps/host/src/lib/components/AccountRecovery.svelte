<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  let {
    mode,
    token = "",
    api,
    onclose,
  }: {
    mode: string;
    token?: string;
    api: (path: string, body?: any, method?: string) => Promise<any>;
    onclose: () => void;
  } = $props();
  let email = $state(""),
    password = $state(""),
    confirmation = $state(""),
    error = $state(""),
    busy = $state(false),
    done = $state(false),
    message = $state("");
  let smtpConfigured = $state(false);
  onMount(() => {
    void api("auth/status")
      .then((status) => (smtpConfigured = status.smtpConfigured))
      .catch(() => {});
  });
  async function submit(method = "owner") {
    busy = true;
    error = "";
    message = "";
    try {
      if (mode === "reset-password") {
        if (password !== confirmation) throw Error("Passwords do not match");
        await api("auth/reset-password", { token, password });
        done = true;
        message = "Password reset. Sign in with your new password.";
      } else if (mode === "verify-email") {
        await api("auth/verify-email", { token });
        done = true;
        message = "Email verified. You can now recover your password by email.";
      } else {
        await api("auth/password-reset-request", { email, method });
        message =
          method === "email"
            ? "If your email is verified and email delivery is configured, a reset link will arrive shortly. Otherwise ask an owner for a link."
            : "If the account exists, the owners can now see your request and generate a reset link.";
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }
</script>

<main class="auth">
  <h1>{t(mode === "verify-email" ? "Verify email" : "Reset password")}</h1>
  {#if error}<p class="error" role="alert">{t(error)}</p>{/if}
  {#if message}<p role="status">{t(message)}</p>{/if}
  {#if !done}
    <form
      class="card stack"
      onsubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {#if mode === "reset-password"}
        <Label class="field-label"
          >{t("New password")}<Input
            required
            type="password"
            minlength={12}
            maxlength={200}
            autocomplete="new-password"
            bind:value={password}
          /></Label
        >
        <Label class="field-label"
          >{t("Confirm new password")}<Input
            required
            type="password"
            minlength={12}
            maxlength={200}
            autocomplete="new-password"
            bind:value={confirmation}
          /></Label
        >
        <Button type="submit" disabled={busy}>{t("Reset password")}</Button>
      {:else if mode === "verify-email"}
        <p>
          {t(
            "Confirm your email address to enable password recovery by email.",
          )}
        </p>
        <Button type="submit" disabled={busy}>{t("Verify email")}</Button>
      {:else}
        <Label class="field-label"
          >{t("Email")}<Input
            required
            type="email"
            autocomplete="email"
            bind:value={email}
          /></Label
        >
        <Button type="submit" disabled={busy}
          >{t("Ask for a password reset link")}</Button
        >
        {#if smtpConfigured}<Button
            type="button"
            variant="outline"
            disabled={busy || !email}
            onclick={(e) => {
              if (e.currentTarget.closest("form")?.reportValidity())
                void submit("email");
            }}>{t("Send reset email (verified addresses only)")}</Button
          >{/if}
      {/if}
    </form>
  {/if}
  <Button variant="ghost" disabled={busy} onclick={onclose}
    >{t("Back to sign in")}</Button
  >
</main>
