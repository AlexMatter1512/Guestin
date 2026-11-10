# Using GuestIn

[Documentation](README.md) · [Getting started](GETTING_STARTED.md) · [API reference](API.md)

- [Accounts and password recovery](#accounts-and-password-recovery)
- [Booking and calendar imports](#booking-and-calendar-imports)
- [Team permissions](#team-permissions)
- [Structures, doors and access codes](#structures-doors-and-access-codes)
- [Shared date format](#shared-date-format)
- [Partner breakfast page](#partner-breakfast-page)
- [Notification history and push](#notification-history-and-push)

## Accounts and password recovery

Owners and collaborators can rotate their password under **Your account → Change password** using their current password. A successful change signs out every device. Login and password-change attempts also have persistent per-account backoff, independent of IP address.

**Password recovery and email verification:** the last onboarding step and **Settings → Email delivery (SMTP)** let owners configure any SMTP server (host, port, security, optional credentials, sender address and name). Credentials are encrypted with `APP_KEY` and never returned to the browser. Use SSL/TLS for implicit TLS (typically 465 or 2465), or STARTTLS for an enforced TLS upgrade (typically 25, 587 or 2587). Unencrypted delivery is available for trusted local relays. Save the settings, send a test email to yourself, then send a verification email. Every user can verify their own address under **Your account**. Verification links expire after 10 minutes; verification is required for recovery by email. SMTP configuration alone does not verify an account.

On the sign-in screen, **Forgot password?** offers **Ask for a password reset link**. Owners receive a private notification linking to **Settings → Team**, where the account shows the pending request. An owner can generate a link for that specific account and share it privately. If SMTP is configured, verified users can instead choose **Send reset email**. Owner assistance remains available if email is unavailable or the address is unverified. Public requests do not reveal whether an account exists. Email requests are limited to one per account and purpose per minute.

Reset links expire after **10 minutes**, work **once**, and replace any earlier reset link for that account. A successful reset revokes all existing sessions and outstanding recovery links. Password changes also invalidate pending recovery links. Recovery and verification links are separate. Migration 9 adds SMTP settings, email verification, short-lived account tokens, delivery throttling, and pending reset requests without changing existing users; existing email addresses start unverified. Workspace wipe removes these settings and records too. With SMTP disabled, a sole owner who loses access needs an existing session or another owner to generate a recovery link.

## Booking and calendar imports

**KrossBooking:** connect your account, complete verification, find the reservation, and review the suggested code. The bearer token is encrypted in the server’s SQLite database and shared across the team’s devices. The browser never stores or receives it; your Kross password is not saved.

**iCal:** upload a calendar or fetch a saved calendar URL, inspect its events, then choose the door those events belong to. For example, a calendar for “Room 2” maps to the Room 2 door. In the draft, you can add the main entrance or other doors before saving. Importing a calendar alone creates no access codes.

**AI:** optionally connect a Gemini API key and extract guest details from a screenshot. KrossBooking, iCal and AI each show source details, mapped doors, dates and links before you choose **Use details in access code**. You still review and save the final form yourself.

All connectors are optional. You can create your first access code without configuring any of them. Set reusable check-in and instructions links under **Settings → Guest links** for each structure. New forms use those defaults; reservation-specific links from a connector take priority. New breakfast allowances start the day after arrival by default, with editable dates.

## Team permissions

**Owner** and **admin** mean the same unrestricted role. Under **Settings → Team**, owners can grant each collaborator permission to create ordinary access codes, add new doors, use booking connectors, and create staff access codes. Code permissions also control managing codes of that type. Staff access codes are separate from collaborator accounts.

New collaborators start with no permissions. Existing staff accounts become collaborators while retaining their previous code creation and connector capabilities. Owners can delete collaborators or promote them to owners. Account management, connector configuration, permanent deletion and database wiping always require an owner role.

Owners can only delete their own accounts; another owner must remain. An owner cannot delete or demote another owner. Deleting an account signs it out everywhere and preserves shared data and access codes.

## Structures, doors and access codes

Internal notes are hidden in access-code forms until you enable **Internal notes**. Hiding the form preserves existing notes.

Owners can deactivate, reactivate or permanently delete structures under **Settings → Properties**. Deactivated structures disappear from everyday views, and guest links and connector requests stop working. Their data stays in the database and backups; notification retention pauses while they are inactive. Reactivating restores access to the existing codes.

**Delete permanently** removes a structure and all its related doors, access codes, usage history, notifications, connectors and settings from the current database. Owners can also permanently delete individual access codes under **Manage access**, including revoked codes. Both require typing the displayed confirmation; deletion cannot be undone. Existing backup files are separate and retain their contents.

Owners can use **Doors JSON** on the doors page or **Access codes JSON** on the codes page to download or upload just that structure’s records. Append adds missing IDs and skips existing records. **Override current list** replaces the entire selected list, including disabled doors or guest/staff/revoked codes. It requires a warning acknowledgement and typed confirmation. Door replacement removes permissions for omitted doors; access-code replacement restores the file’s saved guest tokens, usage and revocation, so old files can reactivate access. Other structures remain unchanged. These files contain working credentials: keep them private. Import doors first when transferring codes to another installation.

The webhook form uses key/value rows for headers and query parameters. The + button adds a row only after existing rows are filled. Provider presets put authentication/query values in those rows; the URL field holds the base endpoint.

Device integrations report whether a request was accepted by the provider; they cannot confirm that a door physically opened. Test your device setup before sharing access with guests.

## Shared date format

Under **Settings → Appearance**, owners can choose a workspace-wide date format: `dd/mm/yyyy` (default), `mm/dd/yyyy` or `yyyy-mm-dd`. It applies to the host, guest and breakfast pages, editable date fields, history and push notification dates. Stored dates and API values remain ISO dates/timestamps. Other host devices and open breakfast pages refresh automatically; guest pages pick up changes when loaded or focused.

## Partner breakfast page

The breakfast totals page supports English and Italian, a shadcn date-range picker and live WebSocket updates. The original `/breakfast/<structure>` links redirect to the new page. Optional notifications are disabled by default and work while the page is open; browser notification permission is requested only when the user enables them. No guest names, codes or activity details are sent to breakfast viewers. Password protection also applies to live connections, which close if their access expires or is revoked.

## Notification history and push

The host bell includes a personal unread badge. Clicking a notification marks it read across your devices and opens its related code or door when available; teammates keep their own read status. Opening or scrolling through history does not mark anything read. Read entries are grayed out.
You can also mark the selected structure's history as read at once. History loads 20 entries at a time and automatically appends older entries as you scroll. Door usage can show the door's primary photo; code changes use a key icon and errors use a warning icon.

The bell shows the selected structure’s history for everyone on your team. Notifications are kept for **three months** by default. Change that period and the maximum number of notifications under **Settings → Notifications**. The default count limit is **1,000 per structure**; the oldest entries are deleted when either limit is reached. Statistics are preserved independently.

While the host app is open, notifications, access-code lists, and usage counts update over an authenticated WebSocket. Lists animate additions and changes, respecting reduced-motion preferences. Access-code creation can notify the team with the creator, code name, and validity dates. Save in-app preferences without enabling browser push.

Push notifications are optional. Each device chooses the structures and event types it receives. History and push messages support Italian and English and include the access-code name when available. You can also receive alerts for invalid guest links, including attempts to load the guest page. Invalid-link alerts are grouped per client and bounded globally; suppressed attempts are summarized on the next invalid request after each one-minute window. Changing push filters does not hide or delete the shared history.

Guest links keep their access code in the address, including when guests change pages or language. The token is never saved in browser storage. For visit history, the browser remembers just the last code’s name and visit date to help explain later invalid-link attempts; this history is an unverified hint, never proof of access.
