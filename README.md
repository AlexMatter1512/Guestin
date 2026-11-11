# GuestIn landing page

The complete landing page, documentation, assets and fictional interactive demos. Application development remains on `main`; website development lives on `gh-pages`.

```sh
bun install --frozen-lockfile
bun run dev
bun run build
bun run preview
```

`bun run build` produces a static website in `dist`, including the host, guest and café demos from `public/demo`. No server runtime or hosting provider integration is required. The default build serves at the domain root. For a subdirectory use `LANDING_BASE_PATH=/Guestin/ bun run build`; links, router paths and bundled demos all receive that prefix. Landing routes and demo routes include their own `index.html` files.

## Updating demos

`demo-source.json` pins the application revision. After the application tests, secret scan and container smoke test pass on `main`, application CI updates this pin to the exact passing commit and calls the landing workflow directly. The built-in token's pushes do not trigger another push workflow, so the explicit reusable-workflow call also covers deployment. Superseded main commits are skipped, and concurrent landing edits are preserved when updating the pin.

The landing workflow checks out the pin from this same repository, exports fresh demos and builds the website. Chromium checks exercise code creation/editing, shared guest and café navigation, reset-on-reload behavior, mobile layout and the animation at both `/` and `/Guestin/`. They also check for API requests, WebSockets, missing assets and uncaught page errors. Deployment runs after these checks pass. To refresh checked-in demos locally, run in an application checkout at that revision:

```sh
bun install --frozen-lockfile
bun scripts/export-landing-demo.ts /absolute/path/to/landing/checkout
```

Sharing the repository lets CI bundle demos without a second repository or cross-repository credentials. Keep the iframe demos on the landing page's origin: navigation and the shared in-memory sample workspace rely on it. Repository location does not affect browser origins. Demos use fictional data, block network connections and reset when the landing page reloads.

MIT licensed; third-party notices are in `docs/licenses`.

## GitHub Pages

The workflow deploys the compiled artifact, not the source branch. Set Settings → Pages → Source to **GitHub Actions**. It reads the Pages base path automatically, so the repository URL and a custom domain both work after rebuilding. Every push to `gh-pages` builds the pinned demos and deploys the static website.

Run the browser checks locally after building for the same base path:

```sh
bunx playwright install chromium
bun run build
bun run test:demo
```
