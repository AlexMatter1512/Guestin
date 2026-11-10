#!/usr/bin/env bash
# Disposable container/volume only. No provider calls or real workspace data.
set -euo pipefail
image="${1:-guestin:ci}"
test_id="guestin-ci-$$"
container="$test_id"
volume="$test_id-data"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker volume create "$volume" >/dev/null
start() {
  docker run --detach --name "$container" \
    --env ORIGIN=http://localhost:3000 --env LOG_FILE=- \
    --mount "type=volume,source=$volume,target=/app/data" "$image" >/dev/null
}
start
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
  const {Database}=await import("bun:sqlite");const db=new Database("/app/data/guestin.sqlite");
  const secrets=await Bun.file("/app/data/runtime-secrets.json").text();
  const {vault}=await import("/app/server/security.ts");
  db.exec("CREATE TABLE ci_canary(value TEXT);");
  db.query("INSERT INTO ci_canary VALUES(?)").run(vault(JSON.parse(secrets).APP_KEY).seal("persistent"));
  db.query("INSERT INTO users VALUES(?,?,?,?,?)").run("ci-owner","CI","ci@example.test","not-a-real-password-hash","owner");
  db.close();
'
# Bootstrap output is intentionally present only while there is no owner.
docker logs "$container" 2>&1 | docker exec -i "$container" bun -e 'const rows=(await Bun.stdin.text()).split("\n").filter(l=>l.startsWith("{")).map(l=>JSON.parse(l));if(rows.filter(r=>r.event==="setup.required"&&r.setupToken).length!==1)throw Error("Missing first-start setup token");'
docker restart "$container" >/dev/null
ready
# Replace the container as Portainer does during an update; keep only its volume.
docker rm -f "$container" >/dev/null
start
ready
docker exec "$container" bun -e '
  const {Database}=await import("bun:sqlite");const db=new Database("/app/data/guestin.sqlite");
  const secrets=await Bun.file("/app/data/runtime-secrets.json").json();
  const {vault}=await import("/app/server/security.ts");
  if(vault(secrets.APP_KEY).open(db.query("SELECT value FROM ci_canary").get()?.value)!=="persistent")throw Error("Encrypted data did not survive replacement");db.close();
'
if docker logs "$container" 2>&1 | grep -q '"event":"setup.required"'; then
  printf 'Setup token was logged after owner creation.\n' >&2
  exit 1
fi
printf 'Container assets, first-start bootstrap and encrypted-data persistence after restart/replacement passed.\n'
