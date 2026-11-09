#!/usr/bin/env bash
# Disposable container/volume only. No provider calls or real workspace data.
set -euo pipefail
image="${1:-oshost:ci}"
test_id="oshost-ci-$$"
container="$test_id"
volume="$test_id-data"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
key="$(openssl rand -hex 32)"
docker volume create "$volume" >/dev/null
docker run --detach --name "$container" \
  --env APP_KEY="$key" --env SETUP_TOKEN=ci-only-setup-token \
  --env ORIGIN=http://localhost:3000 --env LOG_FILE=- \
  --mount "type=volume,source=$volume,target=/app/data" "$image" >/dev/null
ready() {
  for attempt in $(seq 1 30); do
    if docker exec "$container" bun -e 'const r=await fetch("http://localhost:3000/api/v1/health");if(!r.ok)process.exit(1)' >/dev/null 2>&1; then
      return 0
    fi
    if [[ "$(docker inspect --format '{{.State.Running}}' "$container")" != true ]]; then
      docker logs "$container"
      return 1
    fi
    sleep 1
  done
  docker logs "$container"
  return 1
}
ready
# Check the installed static builds and SQLite driver, then persist a canary.
docker exec "$container" bun -e '
  for(const path of ["/host/","/guest/","/host/manifest.webmanifest","/guest/manifest.webmanifest"]){
    const r=await fetch("http://localhost:3000"+path);if(!r.ok)throw Error("Missing packaged asset: "+path);
  }
  const {Database}=await import("bun:sqlite");const db=new Database("/app/data/oshost.sqlite");
  db.exec("CREATE TABLE ci_canary(value TEXT); INSERT INTO ci_canary VALUES('"'"'persistent'"'"');");db.close();
'
docker restart "$container" >/dev/null
ready
docker exec "$container" bun -e '
  const {Database}=await import("bun:sqlite");const db=new Database("/app/data/oshost.sqlite");
  if(db.query("SELECT value FROM ci_canary").get()?.value!=="persistent")throw Error("Database did not survive restart");db.close();
'
printf 'Container assets, SQLite access and restart persistence passed.\n'
