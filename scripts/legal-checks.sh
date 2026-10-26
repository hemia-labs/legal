#!/usr/bin/env bash
set -euo pipefail
bun install --frozen-lockfile
node --test test/release/*.test.mjs
python3 -m unittest discover -s test/deploy -p 'test_*.py'
bun run --cwd apps/api lint:check
bun run --cwd apps/api test --runInBand
bun run --cwd apps/api build
bun run --cwd apps/api test:e2e:isolated
bun run --cwd apps/api test:targets:docker
bun run --cwd apps/api test:authorization:docker
bun run --cwd apps/api test:external:docker
bun run --cwd apps/web lint
bun run --cwd apps/web test
LEGAL_ENV_FILE=/dev/null LEGAL_REVISION="$(git rev-parse HEAD)" docker compose --env-file /dev/null build
python3 test/docker/smoke.py
