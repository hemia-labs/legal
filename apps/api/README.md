# API (NestJS)

API de Hemia Legal: documentos, publicaciones y aceptaciones, con NestJS, PostgreSQL, Redis y almacenamiento S3 privado.

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
    app.module.ts                # módulos activos de datos, auth, Legal y almacenamiento
    config/
      database.config.ts         # config namespaced 'database' (registerAs)
      secrets.config.ts          # scope y credenciales de Vault (registerAs)
    database/
      database.module.ts         # TypeOrmModule.forRootAsync, synchronize: false
      database.types.ts          # contrato del secreto de conexión a PostgreSQL
      migrations/                # migraciones TypeORM
    modules/
      legal/                     # documentos, publicaciones, aceptaciones e integraciones
      auth/                      # OAuth/SSO y sesiones Redis
      storage/                   # objetos privados y URLs firmadas
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

La API requiere PostgreSQL y Redis disponibles. Configura el entorno y aplica las migraciones con `bun run --cwd apps/api migration:run` antes de iniciar. La aplicación no ejecuta migraciones ni seeds al arrancar.

El bucket de publicaciones debe tener versioning y Object Lock configurados fuera de la aplicación. Consulta [el entorno](../../docs/legal/environment.md) y [la autorización personal y de servicio](../../docs/legal/personal-service-authorization.md).

Legal consume eventos de Access mediante `@hemia/event-bus@0.0.3` publicado en npm; los avisos invalidan contexto y no conceden roles. Las respuestas salen mediante outbox con `EVENT_BUS_OUTBOX_PUBLISHER_ENABLED=true`. Consulta [el flujo de eventos](../../docs/legal/event-bus-access-provisioning.md).

Se retiraron el listener y catálogo de workload, su SDK experimental y los tarballs de vendor. La autenticación de servicios conserva OAuth con secretos y clientes de servicio explícitos. El almacenamiento S3 sigue atendiendo los flujos vigentes de publicación y evidencia.

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

Todas las pruebas viven en [`test/`](../../test/README.md). Los módulos agrupan Redis, sesión, eventos y las responsabilidades de aceptación/registro de integraciones; los contratos HTTP se conservan.


## Modo temporal de acciones de Legal

`HEMIA_AUTHORIZATION_MODE=roles` es el valor predeterminado y conserva las asignaciones de roles explícitas.

Para habilitar temporalmente todas las acciones de usuarios humanos elegibles, configurar `HEMIA_AUTHORIZATION_MODE=authenticated` en el backend de Legal **y** en Access. Es válido en local y producción y requiere reiniciar/recrear los servicios. Esta configuración no contiene secretos.

El modo no evita el login SSO, las firmas y bindings del contexto, la expiración, la membresía activa, el producto habilitado, los controles de servicio a servicio ni las validaciones de datos. Access debe emitir el contrato Legal v1/catalog v2 con `assignments: []`; Legal no inventa ni persiste roles o asignaciones. Los catálogos legales compartidos quedan disponibles y la evidencia de aceptaciones y notificaciones permanece limitada a la organización seleccionada.

Legal devuelve los permisos de su catálogo al frontend únicamente tras validar un contexto vigente. Las entradas de caché se separan por modo y los contextos se validan también después de una lectura de caché.

Para revertir, restaurar `HEMIA_AUTHORIZATION_MODE=roles` en Legal y Access y reiniciar/recrear ambos. El modo estricto rechaza contextos sin asignaciones. No se necesitan migraciones, seeds ni cambios de roles en la base.

En modo `authenticated`, la administración humana de clientes de servicio e integraciones conserva la organización seleccionada: las políticas globales o de otras organizaciones no se muestran ni se pueden modificar. Las integraciones nuevas guardan su restricción de organización en la misma transacción. La autorización de máquinas conserva sus políticas existentes.
