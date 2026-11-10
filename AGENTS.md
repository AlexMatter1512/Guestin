# Working on the GuestIn landing page

This branch contains the marketing website and bundled fictional demos. The main application remains on `main`. Preserve other worktrees and local changes. Use Bun's frozen lockfile and run `bun run build` after website changes.

Keep the host, guest and café demos on the landing site's origin. Never connect demonstrations to production APIs, databases or real doors. Refresh demos from the application revision in `demo-source.json`; use its `scripts/export-landing-demo.ts` exporter rather than editing generated `public/demo` files. Update the pin deliberately and verify iframe navigation when refreshing.

The build is a static Vite site with bundled demos. Keep the build independent of hosting providers. Do not change deployment or DNS unless requested.

When asked for a release, review both the commit history and diff since the previous released version, including staged and unstaged changes, before documenting release notes. Do not infer release contents from the latest commit alone. Do not tag a release unless requested.
