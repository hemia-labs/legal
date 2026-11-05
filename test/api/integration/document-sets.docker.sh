#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../../apps/api"
container="hemia-legal-document-sets-test-$$"
trap 'docker stop "$container" >/dev/null 2>&1 || true' EXIT
docker run -d --rm --name "$container" -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=isolated-test-only -e POSTGRES_DB=legal_document_sets_test postgres:18.4 >/dev/null
for attempt in {1..60}; do
 if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d legal_document_sets_test >/dev/null 2>&1; then break; fi
 sleep 1
done
DOCUMENT_SETS_QA_ISOLATED=1 TEST_DATABASE_PORT="$(docker port "$container" 5432 | awk -F: '{print $NF}')" node ../../test/api/integration/document-sets.integration.cjs
