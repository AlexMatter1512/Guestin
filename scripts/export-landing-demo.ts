import { resolve } from "node:path";
import { cp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
const target = process.argv[2];
if (!target || !target.startsWith("/"))
  throw Error(
    "Usage: bun scripts/export-landing-demo.ts /absolute/landing/checkout",
  );
for (const app of ["host", "guest"]) {
  const result = Bun.spawnSync(
    ["bun", "run", "--cwd", `apps/${app}`, "build", "--mode", "demo"],
    {
      env: { ...process.env, GUESTIN_DEMO: "1" },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if (result.exitCode) process.exit(result.exitCode);
  const destination = resolve(target, `public/demo/${app}`);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(`apps/${app}/build-demo`, destination, { recursive: true });
  const indexPath = resolve(destination, "index.html");
  const html = (await readFile(indexPath, "utf8")).replace(
    "<head>",
    `<head><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'">`,
  );
  await writeFile(indexPath, html);
  if (app === "host") {
    for (const id of ["demo-0", "demo-1"]) {
      const folder = resolve(destination, "breakfast", id);
      await mkdir(folder, { recursive: true });
      await writeFile(resolve(folder, "index.html"), html);
    }
  }
  await writeFile(
    resolve(destination, "source.json"),
    JSON.stringify(
      {
        revision: Bun.spawnSync(["git", "rev-parse", "HEAD"])
          .stdout.toString()
          .trim(),
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
