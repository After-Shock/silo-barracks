#!/usr/bin/env bash
set -euo pipefail

theme_db_name="silo-barracks-theme-test-db-$$"
cleanup() {
  if docker inspect "$theme_db_name" >/dev/null 2>&1; then
    docker stop "$theme_db_name" >/dev/null
  fi
}
trap cleanup EXIT

docker run --rm -d --name "$theme_db_name" --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=barracks_test -e POSTGRES_PASSWORD=barracks_test_only -e POSTGRES_DB=barracks_test -p 127.0.0.1::5432 postgres:16-alpine
for attempt in $(seq 1 30); do
  if docker exec "$theme_db_name" pg_isready -U barracks_test -d barracks_test; then break; fi
  test "$attempt" -lt 30
  sleep 1
done
theme_db_port=$(docker port "$theme_db_name" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')
test -n "$theme_db_port"
test "$(docker inspect -f '{{.Config.Image}} {{range .Mounts}}{{.Name}}{{end}}' "$theme_db_name")" = 'postgres:16-alpine '

SILO_TEST_DATABASE_URL="postgres://barracks_test:barracks_test_only@127.0.0.1:${theme_db_port}/barracks_test" npm test
npm run theme:check
npm run lint --workspace apps/web
npm run build --workspace apps/web
git diff --check

mkdir -p /tmp/silo-barracks-theme-qa
BARRACKS_SMOKE_POLLS=4 BARRACKS_CHROMIUM=/opt/google/chrome/chrome BARRACKS_PLAYWRIGHT=/tmp/silo-barracks-ui.e9CWfq/node_modules/playwright BARRACKS_QA_DIR=/tmp/silo-barracks-theme-qa node scripts/check-barracks-ui.cjs
BARRACKS_CHROMIUM=/opt/google/chrome/chrome BARRACKS_PLAYWRIGHT=/tmp/silo-barracks-ui.e9CWfq/node_modules/playwright BARRACKS_QA_DIR=/tmp/silo-barracks-theme-qa node scripts/check-fleet-ui.cjs
BARRACKS_CHROMIUM=/opt/google/chrome/chrome BARRACKS_PLAYWRIGHT=/tmp/silo-barracks-ui.e9CWfq/node_modules/playwright BARRACKS_QA_DIR=/tmp/silo-barracks-theme-qa node scripts/check-universal-theme-ui.cjs

docker compose ps
