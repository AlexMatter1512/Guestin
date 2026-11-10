# Security policy

guestin controls physical access. Test changes with fake device adapters and
disposable data, never occupied properties or real guest links.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/AlexMatter1512/oshost/security/advisories/new).
Include the affected version or commit, impact, and minimal reproduction using
dummy accounts and tokens. Remove passwords, live guest links, booking records,
device credentials, backups, and runtime keys from attachments and logs.

If private reporting is unavailable, open an issue asking the maintainer for a
private contact channel. Do not include vulnerability details in that issue.

Please allow time to investigate and coordinate a fix before publishing exploit
details. This project has no guaranteed response time or long-term support
commitment; fixes target the latest version.

## Credentials accidentally published

Revoke or rotate affected credentials at their source immediately. Deleting the
current file does not remove copies in Git history, forks, logs, or published
images. Report the exposure privately without posting the credential again.

## Secret scanning

CI runs a pinned Gitleaks release against complete available Git history on
pushes and pull requests. `.gitleaks.toml` extends the upstream rules; exceptions
must match a specific documented value and source path. Never exclude entire
test directories or add real credentials to an allowlist. Pattern-based
scanning does not guarantee detection of every secret or guest link.
