# Landing demo

Export the real host UI with a browser-only fake transport:

```sh
bun scripts/export-landing-demo.ts /absolute/path/to/Guestin-landing
```

The output is copied into the landing checkout's `public/demo/host` and `public/demo/guest` folders, including `source.json` with the source revision and build time. The landing site can then build without the app checkout. Serve the demo at `/demo/host/`. The landing Vite configuration serves its entry before the marketing router; Cloudflare serves the built directory as static assets.

Demo builds use `--mode demo` and `GUESTIN_DEMO=1`; regular builds retain `/host` and the real API. Sample records live in memory on the embedding page, so switching iframe views preserves created and edited codes. Reload the landing page to reset them. Standalone demo pages reset on refresh. No server, database, device, SMTP, connector login or push permission is required. The demo includes owner Settings and Profile, with in-memory configuration and simulated email/device delivery. Host codes, guest access, and café breakfast totals share the same in-memory workspace. Guest and café links send a validated navigation message to the embedding page. Production behavior is checked with the normal check/test/build commands.

The screenshot gallery uses fictional fixtures from this build. Re-capture workspace, mobile codes, calendar popover, doors, statistics and the dark code creation form after significant host UI changes.

With the landing preview running, run `bun scripts/landing-demo-smoke.ts`. Override `LANDING_URL` when using another local port. This checks sample creation, reset, language, theme and absence of backend traffic.

Run `bun scripts/landing-demo-connected-smoke.ts` against the landing preview to verify embedded create/edit, code-specific guest navigation, breakfast links, and mobile detection.
