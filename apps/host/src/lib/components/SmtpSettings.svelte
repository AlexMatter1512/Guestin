<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "$lib/i18n.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  let {
    api,
    oncontinue,
  }: {
    api: (path: string, body?: any, method?: string) => Promise<any>;
    oncontinue?: () => void;
  } = $props();
  let form = $state({
    host: "",
    port: 587,
    security: "starttls",
    username: "",
    password: "",
    from: "",
    fromName: "oshost",
  });
  let busy = $state(false),
    loaded = $state(false),
    configured = $state(false),
    hasPassword = $state(false),
    message = $state(""),
    error = $state("");
  async function perform(work: () => Promise<void>) {
    busy = true;
    error = "";
    message = "";
    try {
      await work();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }
  onMount(() => {
    void perform(async () => {
      const saved = await api("admin/smtp");
      if (saved) {
        form = saved;
        configured = true;
        hasPassword = saved.hasPassword;
      }
      loaded = true;
    });
  });
</script>

<section class="card stack" data-tour="smtp">
  <h2>{t("Email delivery (SMTP)")}</h2>
  <p>
    {t(
      "Connect any SMTP server to send verification and password recovery emails. You can skip this and let owners generate recovery links.",
    )}
  </p>
  {#if error}<p class="error" role="alert">{t(error)}</p>{/if}
  {#if message}<p role="status">{t(message)}</p>{/if}
  {#if loaded}
    <form
      class="stack"
      onsubmit={(e) => {
        e.preventDefault();
        void perform(async () => {
          await api("admin/smtp", form, "PUT");
          configured = true;
          hasPassword = !!form.password || hasPassword;
          form.password = "";
          message = "SMTP settings saved";
        });
      }}
    >
      <Label class="field-label"
        >{t("SMTP host")}<Input
          required
          bind:value={form.host}
          placeholder="smtp.example.com"
        /></Label
      >
      <Label class="field-label"
        >{t("Port")}<Input
          required
          type="number"
          min="1"
          max="65535"
          bind:value={form.port}
        /></Label
      >
      <label class="field-label"
        >{t("Connection security")}<select bind:value={form.security}>
          <option value="starttls">STARTTLS</option><option value="tls"
            >SSL/TLS</option
          ><option value="plain">{t("Unencrypted (trusted relay only)")}</option
          >
        </select></label
      >
      <p class="muted">
        {t("Use SSL/TLS for ports 465 or 2465; STARTTLS for 25, 587 or 2587.")}
      </p>
      <Label class="field-label"
        >{t("SMTP username")}<Input
          bind:value={form.username}
          autocomplete="off"
        /></Label
      >
      <Label class="field-label"
        >{t("SMTP password")}<Input
          type="password"
          bind:value={form.password}
          autocomplete="new-password"
          placeholder={hasPassword
            ? t("Leave blank to keep saved password")
            : ""}
        /></Label
      >
      <Label class="field-label"
        >{t("Sender email")}<Input
          required
          type="email"
          bind:value={form.from}
        /></Label
      >
      <Label class="field-label"
        >{t("Sender name")}<Input bind:value={form.fromName} /></Label
      >
      <Button type="submit" disabled={busy}>{t("Save SMTP settings")}</Button>
    </form>
    {#if configured}<div class="row">
        <Button
          variant="outline"
          disabled={busy}
          onclick={() =>
            perform(async () => {
              await api("me/verify-email", {});
              message =
                "Verification email sent. The link expires in 10 minutes.";
            })}>{t("Send verification email")}</Button
        >
        <Button
          variant="outline"
          disabled={busy}
          onclick={() =>
            perform(async () => {
              await api("admin/smtp/test", {});
              message = "Test email sent to your address";
            })}>{t("Send test email")}</Button
        >
        <Button
          variant="outline"
          disabled={busy}
          onclick={() =>
            perform(async () => {
              await api("admin/smtp", undefined, "DELETE");
              configured = false;
              hasPassword = false;
              message = "SMTP disabled";
            })}>{t("Disable SMTP")}</Button
        >
      </div>{/if}
  {/if}
  {#if oncontinue}<Button variant="outline" disabled={busy} onclick={oncontinue}
      >{t("Continue")}</Button
    >{/if}
</section>
