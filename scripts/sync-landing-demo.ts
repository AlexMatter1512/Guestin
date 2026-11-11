import { appendFile, readFile, writeFile } from "node:fs/promises";

const revision = process.argv[2];
if (!revision || !/^[0-9a-f]{40}$/.test(revision)) {
  throw new Error(
    "Pass the full main commit SHA that completed application CI",
  );
}

function git(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr.toString()}`,
    );
  }
  return result.stdout.toString().trim();
}

async function reportRevision(value: string) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `revision=${value}\n`);
  }
}

if (git("status", "--porcelain")) {
  throw new Error("Run synchronization in a clean, dedicated landing checkout");
}

// A landing-page edit can land between fetching gh-pages and pushing its updated pin.
// Retry from the new branch head so the edit is preserved without a force push.
for (let attempt = 0; attempt < 3; attempt++) {
  git(
    "fetch",
    "origin",
    "main:refs/remotes/origin/main",
    "gh-pages:refs/remotes/origin/gh-pages",
  );
  if (git("rev-parse", "origin/main") !== revision) {
    console.log(
      "Main has advanced since this CI run; its own passing build will update the demo.",
    );
    await reportRevision("");
    process.exit(0);
  }
  git("switch", "--force-create", "landing-demo-sync", "origin/gh-pages");
  const source = JSON.parse(await readFile("demo-source.json", "utf8"));
  if (source.revision === revision) {
    // Retrying a run whose pin was already committed must still run browser checks/deployment.
    await reportRevision(revision);
    process.exit(0);
  }
  source.revision = revision;
  await writeFile("demo-source.json", JSON.stringify(source, null, 2) + "\n");
  git("config", "user.name", "github-actions[bot]");
  git(
    "config",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com",
  );
  git("add", "demo-source.json");
  git("commit", "-m", `Sync landing demos to main ${revision.slice(0, 7)}`);
  const push = Bun.spawnSync(["git", "push", "origin", "HEAD:gh-pages"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (push.exitCode === 0) {
    await reportRevision(revision);
    process.exit(0);
  }
}
throw new Error("Could not update the demo revision after three attempts");
