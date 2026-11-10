import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
export default defineConfig({
  plugins: [
    {
      name: "static-landing-routes",
      apply: "build",
      async closeBundle() {
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
          const path = req.url?.split("?")[0] ?? "";
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
