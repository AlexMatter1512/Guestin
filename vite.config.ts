import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
const base = process.env.LANDING_BASE_PATH || "/";
if (!base.startsWith("/") || !base.endsWith("/")) {
  throw new Error("LANDING_BASE_PATH must start and end with /, for example /Guestin/");
}
export default defineConfig({
  base,
  plugins: [
    {
      name: "static-landing-routes",
      apply: "build",
      async closeBundle() {
        // Rebase the exporter-generated demo bundles without changing their source snapshot.
        async function rebaseDemo(directory: URL) {
          for (const item of await readdir(directory, { withFileTypes: true })) {
            const file = new URL(item.name + (item.isDirectory() ? "/" : ""), directory);
            if (item.isDirectory()) await rebaseDemo(file);
            else if (/\.(html|js|css|json|webmanifest)$/.test(item.name)) {
              const content = await readFile(file, "utf8");
              const rebased = content
                .replace(/\/demo\//g, `${base}demo/`)
                .replace(/(["'`])\/(host|guest)\//g, `$1${base}demo/$2/`);
              if (rebased !== content) await writeFile(file, rebased);
            }
          }
        }
        await rebaseDemo(new URL("./dist/demo/", import.meta.url));
        await writeFile(new URL("./dist/.nojekyll", import.meta.url), "");
        // Give every landing route an entry on ordinary static file servers.
        const html = await readFile(new URL("./dist/index.html", import.meta.url), "utf8");
        for (const file of await readdir(new URL("./src/routes/", import.meta.url))) {
          if (!file.endsWith(".tsx") || file.startsWith("__") || file === "index.tsx") continue;
          const route = file
            .replace(/\.tsx$/, "")
            .replace(/\.index$/, "")
            .replaceAll(".", "/");
          const directory = new URL(`./dist/${route}/`, import.meta.url);
          await mkdir(directory, { recursive: true });
          await writeFile(new URL("index.html", directory), html);
        }
      },
    },
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    {
      name: "guestin-demo-entry",
      enforce: "pre",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const urlPath = req.url?.split("?")[0] ?? "";
          const path = base === "/" ? urlPath : "/" + urlPath.slice(base.length);
          const app = path.startsWith("/demo/guest") ? "guest" : "host";
          if (!/^\/demo\/(host|guest)\/(?:breakfast\/[^/]+\/?)?$/.test(path)) return next();
          try {
            const html = await readFile(
              new URL(`./public/demo/${app}/index.html`, import.meta.url),
              "utf8",
            );
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          } catch {
            next();
          }
        });
      },
    },
  ],
});
