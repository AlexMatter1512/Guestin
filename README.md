# GuestIn landing page

The complete landing page, documentation, assets and fictional interactive demos. Application development remains on `main`; website development lives on `gh-pages`.

```sh
bun install --frozen-lockfile
bun run dev
bun run build
bun run preview
```

`bun run build` produces a static website in `dist`, including the host, guest and café demos from `public/demo`. No server runtime or hosting provider integration is required. Serve `dist` at the domain root. Landing routes and demo routes include their own `index.html` files.

## Updating demos

`demo-source.json` pins the application revision. The build workflow checks out that revision from this same repository, exports fresh demos and builds the website. To refresh checked-in demos locally, run in an application checkout at that revision:

```sh
bun install --frozen-lockfile
bun scripts/export-landing-demo.ts /absolute/path/to/landing/checkout
```

Sharing the repository lets CI bundle demos without a second repository or cross-repository credentials. Keep the iframe demos on the landing page's origin: navigation and the shared in-memory sample workspace rely on it. Repository location does not affect browser origins. Demos use fictional data, block network connections and reset when the landing page reloads.

MIT licensed; third-party notices are in `docs/licenses`.
