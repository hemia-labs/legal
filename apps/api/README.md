# API (NestJS)

Backend del monorepo `nextjs-nestjs`. Plantilla NestJS + TypeORM + PostgreSQL.
La base de datos viene **desactivada** hasta que la configures (ver abajo).

## Stack

- **NestJS 11** — framework HTTP (módulos, controllers, services).
- **TypeORM** — ORM + migraciones contra PostgreSQL.
- **PostgreSQL** — base de datos (timezone `America/Mexico_City`).
- **@nestjs/config** — configuración tipada por namespace (`registerAs`).
- **class-validator / class-transformer** — validación de DTOs vía `ValidationPipe` global.
- **TypeScript**, **Jest** (tests), **ESLint + Prettier**.
- Gestor de paquetes: **bun**.

## Estructura

```
apps/api/
  data-source.ts                 # DataSource para el CLI de migraciones
  src/
    main.ts                      # bootstrap: ValidationPipe global + CORS, escucha PORT (3017)
    app.module.ts                # módulo raíz (DatabaseModule/WidgetsModule comentados hasta tener DB)
    config/
      database.config.ts         # config namespaced 'database' (registerAs)
      secrets.config.ts          # scope y credenciales de Vault (registerAs)
    database/
      database.module.ts         # TypeOrmModule.forRootAsync, synchronize: false
      database.types.ts          # contrato del secreto de conexión a PostgreSQL
      migrations/                # migraciones TypeORM
    modules/
      widgets/                   # módulo dummy de ejemplo (controller, service, entity, dtos)
```

## Variables de entorno

Copia `.env.example` a `.env` y completa los valores:

```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=
DB_PASSWORD=
DB_DATABASE=
DB_LOGGING=false

# Vault para la conexión de TypeORM; con false se usan los valores DB_*.
SECRETS_ENABLED=false
SECRETS_ENVIRONMENT=dev
SECRETS_CATEGORY=internal
SECRETS_OWNER=hemia
SECRETS_SYSTEM=legal
SECRETS_CACHE_ENABLED=true
SECRETS_CACHE_TTL_MS=60000
VAULT_BASE_URL=https://vault.hemia.com
VAULT_ROLE_ID=
VAULT_SECRET_ID=
VAULT_AUTH_PATH=approle
VAULT_MOUNT_PREFIX=kv-
VAULT_TIMEOUT_MS=5000

# RabbitMQ / Event Bus de provisioning Access → Legal
AMQP_URL=amqp://user:password@localhost:5672
EVENT_BUS_ENABLED=true
EVENT_BUS_SERVICE_NAME=hemia-legal
EVENT_BUS_PREFETCH=10
EVENT_LOG_FILE=events.log.jsonl

# S3 privado para publicaciones y evidencias
S3_REGION=us-east-1
S3_BUCKET=
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
S3_SIGNED_URL_TTL_SECONDS=300
```

Con `SECRETS_ENABLED=true`, el API lee el secreto lógico
`database/postgres` desde HashiCorp Vault KV v2. Con el scope por defecto se
resuelve como `kv-dev/internal/hemia/legal/database/postgres` y debe contener:

```json
{
  "db_database": "legal",
  "db_host": "postgres.example.com",
  "db_logging": false,
  "db_password": "...",
  "db_port": 5432,
  "db_username": "legal"
}
```

`PORT` opcional (default `3017`). `.env` y `.env.local` están en `.gitignore`.

## Arranque

```bash
bun install
bun run --cwd apps/api start:dev   # watch mode
```

Sin DB el servidor levanta igual (responde en `/`). El módulo de datos está apagado.

## Activar la base de datos

1. Completa `.env`.
2. En `src/app.module.ts` descomenta los imports de `DatabaseModule` y `WidgetsModule`.
3. Aplica manualmente el contrato SQL de almacenamiento documental acordado con DBA.
   Esta implementación no genera ni ejecuta migraciones TypeORM.

Para el flujo de publicaciones, el bucket debe existir y tener versioning y Object Lock
configurados fuera de la aplicación.

Legal recibe provisioning, cambios de producto y memberships desde RabbitMQ mediante
`@hemia/event-bus`; no expone un webhook HTTP para eventos de Access. La migración
`1785727030700_AddEventBusOutboxMetadata` debe ejecutarse manualmente después de aplicar las
migraciones de tenants. El flujo y los payloads están documentados en
`docs/legal/event-bus-access-provisioning.md`.
El estado de la conexión puede consultarse en `GET /health/event-bus`.
Por ahora los eventos outbound de provisioning se publican directamente; el relay periódico de
El publisher de outbox debe permanecer activo con `EVENT_BUS_OUTBOX_PUBLISHER_ENABLED=true`.

Las entidades nuevas son `legal_publications`, `legal_publication_assets` y
`legal_evidence`; también requieren las columnas de contexto y autenticación descritas
en `docs/almacenamiento_hemia_legal.md`.

No actives el flujo nuevo antes de aplicar ese contrato en PostgreSQL.

Las migraciones existentes del proyecto pueden seguir documentando otros cambios:

```bash
bun run --cwd apps/api migration:run
```

## Migraciones

```bash
bun run --cwd apps/api migration:generate
bun run --cwd apps/api migration:run
bun run --cwd apps/api migration:revert
```

`migration:generate` usa `src/database/migrations/Migration`; TypeORM genera el prefijo
timestamp automáticamente.

`synchronize` está en `false`: todo cambio de schema requiere migración.

### E2E y base de datos

Los tests e2e solo pueden ejecutarse contra una base aislada cuyo nombre incluya
`test` o `e2e` (por ejemplo, `legal_test`). La suite limpia esa base entre casos;
si detecta la base de desarrollo o producción, se detiene antes de conectarse.
Configura `E2E_DB_DATABASE` antes de ejecutar `bun run test:e2e`.

## Tests y build

```bash
bun run --cwd apps/api test
bun run --cwd apps/api build
```
