# nextjs-nestjs

Monorepo con **Next.js** (frontend) y **NestJS** (backend), gestionado con **bun workspaces**.

## Apps

| App                    | Stack                                     | Puerto | README                    |
| ---------------------- | ----------------------------------------- | ------ | ------------------------- |
| [`apps/web`](apps/web) | Next.js 16, React 19, Tailwind v4, shadcn | 5180   | [ver](apps/web/README.md) |
| [`apps/api`](apps/api) | NestJS 11, TypeORM, PostgreSQL            | 3017   | [ver](apps/api/README.md) |

La API requiere PostgreSQL y Redis configurados. Las migraciones se ejecutan explícitamente, nunca al arrancar; consulta el README de `apps/api`.

## Requisitos

- [bun](https://bun.sh)
- PostgreSQL y Redis para la API.

## Arranque

```bash
bun install

bun run dev        # inicia frontend; ejecutar dev:api en otra terminal
bun run dev:web    # solo frontend (http://localhost:5180)
bun run dev:api    # solo backend  (http://localhost:3017)
```

## Build

```bash
bun run build      # build de todas las apps
```

## Estructura

```
nextjs-nestjs/
  apps/
    web/   # Next.js (App Router, Tailwind v4, shadcn) — ver apps/web/README.md
    api/   # NestJS (TypeORM, PostgreSQL) — ver apps/api/README.md
  test/        # todas las pruebas, fixtures y runners de API/web
  package.json   # workspaces + scripts root
```

Cada app documenta su stack, variables de entorno y comandos en su propio README.

## Pruebas y organización

Todas las pruebas están en [`test/`](test/README.md). Ejecutar `bun run test` desde esta raíz para las suites unitarias de API y web. Las integraciones y E2E son explícitas y requieren entornos aislados. Los módulos agrupan Redis, sesión, eventos y aceptación/registro de integraciones; los contratos de API se conservan.

## Sistemas

El catálogo de Sistemas y sus esquemas se administran desde Console; Legal conserva los datos y valida su uso en aceptaciones externas. Ver [contrato, migración y despliegue](apps/api/SYSTEMS.md). Para registro, contratación y actualizaciones de políticas, consultar [conjuntos de documentos y evidencia](apps/api/DOCUMENT-SETS.md).

## CI, releases y producción

Ver [DEPLOY.md](DEPLOY.md) para el pipeline, las imágenes, la configuración de GitHub/servidor y las operaciones explícitas de migración, deploy y rollback. Ejecutar `bun run ci` con Node 24, Bun 1.4.4 y Docker para validar el mismo flujo que Actions.


### Read-only deployment diagnostics

Run the manual **Legal deployment** workflow from `main` with operation `diagnose`; leave `release_tag` empty. It uses the existing protected `prod` environment, Tailscale identity, pinned SSH host and dedicated deploy user. It does not download a release, update environment/AMQP settings, run the deploy controller, recreate containers, migrate or seed. The versioned script runs over SSH stdin without remote temporary files.

Diagnostics read only Docker containers labelled project `hemia-legal` and service `api`/`web`: image, state, healthcheck output and the last 80 log entries from 30 minutes (bounded output). Secrets, authorization/cookie values, private keys, JWTs and URL credentials are redacted before output. It never requests container environment variables or reads `production.env`. Treat the resulting logs as operational information and review them within the protected workflow.


The API diagnostic also runs a fixed, 15-second Node probe inside an already-verified running API container. It loads only configuration, secrets and Redis modules, uses the runtime Vault Redis configuration for `PING`, and opens a separate PostgreSQL connection with `default_transaction_read_only=on` for `SELECT 1` and migrations-table existence. PostgreSQL also runs the exact unqualified migrations read used by readiness and its public-qualified equivalent, reporting only status/row counts and public-schema/search-path booleans. RabbitMQ only performs the normal authenticated connection handshake and a passive check of the existing `hemia.events` exchange. Its SDK health ping is skipped because it declares/deletes a temporary queue. It never imports `AppModule`/`DatabaseModule`, initializes TypeORM, starts jobs, publishes messages or runs the event-bus SDK `ping()` (which declares/deletes a temporary queue). Three environment flags are reported as booleans only; credentials remain internal and are removed from errors before output.
