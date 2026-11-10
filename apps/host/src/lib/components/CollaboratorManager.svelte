<script lang="ts">
  import { formatDisplayDateTime } from "$lib/date-settings.svelte";
  import {
    permissionLabels,
    type Permission,
  } from "../../../../../shared/permissions";
  import { Button } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import Modal from "$lib/components/Modal.svelte";
  import { t } from "$lib/i18n.svelte";
  import { toast } from "svelte-sonner";
  let {
    users,
    currentUserId,
    api,
    reload,
    onDelete,
  }: {
    users: any[];
    currentUserId: string;
    api: (path: string, body?: any, method?: string) => Promise<any>;
    reload: () => Promise<void>;
    onDelete: (account: any) => void;
  } = $props();
  let busy = $state(false),
    error = $state(""),
    promotion = $state<any>(null);
  let resetLink = $state<{ id: string; url: string; expires: number } | null>(
    null,
  );
  async function generateReset(account: any) {
    busy = true;
    error = "";
    resetLink = null;
    try {
      const result = await api(`users/${account.id}/password-reset-link`, {});
      resetLink = { id: account.id, ...result };
      await reload();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }
  const keys = Object.keys(permissionLabels) as Permission[];
  async function update(account: any, change: any) {
    busy = true;
    error = "";
    try {
      await api(`users/${account.id}`, change, "PATCH");
      promotion = null;
      await reload();
      toast.success(t("Account updated"));
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }
</script>

<p class="muted">
  {t(
    "Owners and admins have the same unrestricted role. Collaborators only receive the permissions you enable below.",
  )}
</p>
<p class="muted">
  {t(
    "New collaborators start without permissions. Code permissions also control editing and managing codes of that type.",
  )}
</p>
{#if error}<p class="error" role="alert">{t(error)}</p>{/if}
{#each users as account (account.id)}
  <section class="stack rounded-lg border p-4" aria-label={account.name}>
    <div>
      <strong>{account.name}</strong>
      <p class="muted">
        {account.email} · {t(
          account.role === "owner" ? "Owner / Admin" : "Collaborator",
        )}
      </p>
    </div>
    <p>{t(account.emailVerified ? "Email verified" : "Email not verified")}</p>
    {#if account.passwordResetRequestedAt}<p role="status">
        {t("Password reset requested")}: {formatDisplayDateTime(
          account.passwordResetRequestedAt,
        )}
      </p>{/if}
    <Button
      variant="outline"
      disabled={busy}
      onclick={() => generateReset(account)}
      >{t("Generate password reset link")}</Button
    >
    {#if resetLink && resetLink.id === account.id}
      <p>
        {t(
          "Share this link privately. It is valid for 10 minutes and can be used once.",
        )}
      </p>
      <input
        aria-label={t("Password reset link")}
        readonly
        value={resetLink.url}
        onclick={(e) => e.currentTarget.select()}
      />
      <p>{t("Expires")}: {new Date(resetLink.expires).toLocaleTimeString()}</p>
    {/if}
    {#if account.role === "collaborator"}
      {#each keys as key (key)}
        <Label class="inline" for={`permission-${account.id}-${key}`}
          ><Switch
            id={`permission-${account.id}-${key}`}
            checked={account.permissions?.[key] === true}
            disabled={busy}
            onCheckedChange={(enabled) =>
              update(account, { permissions: { [key]: enabled } })}
          />{t(permissionLabels[key])}</Label
        >
      {/each}
      <div class="row">
        <Button
          variant="outline"
          disabled={busy}
          onclick={() => (promotion = account)}>{t("Promote to owner")}</Button
        ><Button
          variant="destructive"
          disabled={busy}
          onclick={() => onDelete(account)}>{t("Delete account")}</Button
        >
      </div>
    {:else if account.id === currentUserId}
      <p class="muted">
        {t(
          "Only you can delete your owner account. Another owner must remain.",
        )}
      </p>
      <Button
        variant="destructive"
        disabled={busy || users.filter((u) => u.role === "owner").length < 2}
        onclick={() => onDelete(account)}>{t("Delete my account")}</Button
      >
    {:else}<p class="muted">
        {t("Owners can only delete their own accounts.")}
      </p>{/if}
  </section>
{/each}
<Modal
  open={!!promotion}
  title={t("Promote to owner")}
  onclose={() => {
    if (!busy) promotion = null;
  }}
>
  <div class="stack">
    <p><strong>{promotion?.name}</strong></p>
    <p>
      {t(
        "This grants unrestricted administration, including deleting collaborator accounts, configuring connectors and wiping the entire database. Owners cannot be demoted or deleted by another owner.",
      )}
    </p>
    <Button disabled={busy} onclick={() => update(promotion, { role: "owner" })}
      >{t("Confirm promotion")}</Button
    >
  </div>
</Modal>
