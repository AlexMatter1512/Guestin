# Contributing

Issues, bug reports, translations, and usability improvements are welcome. Include the steps to reproduce, expected behavior, and browser/device. Keep guest links, passwords, and provider keys out of reports.

Report security vulnerabilities privately using [the security policy](SECURITY.md).

## Development

Install Bun 1.4 or later, then:

```sh
bun install --frozen-lockfile
bun run build
bun start
```

Open `http://localhost:3000/host/`. Startup creates local keys and prints the initial setup token. An optional `.env` can override configuration; see [.env.example](.env.example).

## Checks

```sh
bun run check
bun test
bun run build
```

Browser checks in `scripts/*-smoke.ts` use Playwright and installed Google Chrome. They use temporary databases and fixture providers. Run the checks relevant to your change, such as `bun scripts/mobile-ui-smoke.ts` or `bun scripts/connector-ui-smoke.ts`.

Use fake adapters for device tests. Real unlocks and external notification delivery do not belong in automated tests.

### Optional legacy visual comparison

`bun scripts/guest-parity-smoke.ts` skips by default. To compare against your own
legacy BnBFrontend checkout, install its dependencies and set
`GUESTIN_LEGACY_GUEST_ROOT=/absolute/path/to/BnBFrontend` before running the script.
An explicitly configured but incomplete reference fails with a clear error.
Normal checks and browser smoke tests do not require that checkout. Legacy
property images are deliberately excluded from guestin.

### Secret scanning

With Gitleaks 8.30.1 installed, scan history before publishing:

```sh
gitleaks git --redact --config .gitleaks.toml --log-opts="--all" .
```

CI runs this automatically on pushes and pull requests with full history.
Review any exception as a code change; use an exact value and narrow path.

## Pull requests

Explain the problem, the resulting behavior, and how it was checked. Include before/after screenshots for visual changes. Preserve existing source and dependency notices.
