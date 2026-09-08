#!/usr/bin/env bash
set -euo pipefail

theme_db_name="silo-barracks-theme-test-db-$$"
theme_db_id=""
cleanup() {
  if [[ -n "$theme_db_id" ]] && docker inspect "$theme_db_id" >/dev/null 2>&1; then
    docker stop "$theme_db_id" >/dev/null
  fi
}
trap cleanup EXIT

theme_db_id=$(docker run --rm -d --name "$theme_db_name" --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=barracks_test -e POSTGRES_PASSWORD=barracks_test_only -e POSTGRES_DB=barracks_test -p 127.0.0.1::5432 postgres:16-alpine)
for attempt in $(seq 1 30); do
  if docker exec "$theme_db_id" pg_isready -U barracks_test -d barracks_test; then break; fi
  test "$attempt" -lt 30
  sleep 1
done
theme_db_port=$(docker port "$theme_db_id" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')
test -n "$theme_db_port"
test "$(docker inspect -f '{{.Config.Image}} {{range .Mounts}}{{.Name}}{{end}}' "$theme_db_id")" = 'postgres:16-alpine '

barracks_chromium="${BARRACKS_CHROMIUM:-/opt/google/chrome/chrome}"
barracks_playwright="${BARRACKS_PLAYWRIGHT:-/tmp/silo-barracks-ui.e9CWfq/node_modules/playwright}"
barracks_qa_dir="${BARRACKS_QA_DIR:-/tmp/silo-barracks-theme-qa}"
barracks_smoke_polls="${BARRACKS_SMOKE_POLLS:-4}"

SILO_TEST_DATABASE_URL="postgres://barracks_test:barracks_test_only@127.0.0.1:${theme_db_port}/barracks_test" npm test
npm run theme:check
npm run lint --workspace apps/web
npm run build --workspace apps/web
git diff --check

mkdir -p "$barracks_qa_dir"
BARRACKS_SMOKE_POLLS="$barracks_smoke_polls" BARRACKS_CHROMIUM="$barracks_chromium" BARRACKS_PLAYWRIGHT="$barracks_playwright" BARRACKS_QA_DIR="$barracks_qa_dir" node scripts/check-barracks-ui.cjs
BARRACKS_CHROMIUM="$barracks_chromium" BARRACKS_PLAYWRIGHT="$barracks_playwright" BARRACKS_QA_DIR="$barracks_qa_dir" node scripts/check-fleet-ui.cjs
BARRACKS_CHROMIUM="$barracks_chromium" BARRACKS_PLAYWRIGHT="$barracks_playwright" BARRACKS_QA_DIR="$barracks_qa_dir" node scripts/check-universal-theme-ui.cjs

for service in silo-barracks-db silo-barracks; do
  service_id=$(docker compose ps -q "$service")
  test -n "$service_id"
  test "$(docker inspect -f '{{.State.Health.Status}}' "$service_id")" = healthy
done

docker compose ps
