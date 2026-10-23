#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../../apps/api"
container="hemia-legal-targets-test-$$"
trap 'docker stop "$container" >/dev/null 2>&1 || true' EXIT
docker run -d --rm --name "$container" -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=isolated-test-only -e POSTGRES_DB=legal_targets_test postgres:18.4 >/dev/null
for attempt in {1..60}; do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d legal_targets_test >/dev/null 2>&1; then break; fi
  sleep 1
done
TEST_DATABASE_PORT="$(docker port "$container" 5432 | awk -F: '{print $NF}')" TS_NODE_TRANSPILE_ONLY=true node -r ts-node/register ../../test/api/integration/target-validation.integration.cjs
