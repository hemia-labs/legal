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


## Autorización por roles y permisos

Legal admite únicamente `HEMIA_AUTHORIZATION_MODE=roles` (predeterminado). El antiguo valor `authenticated` impide el arranque: desplegar Legal y Access con roles, con las asignaciones explícitas revisadas antes de activar la nueva versión.

Cada acción humana exige un contexto firmado y vigente de Access, identidad/organización/membresía vinculadas, producto activo y asignaciones del catálogo Legal. Una sesión sin asignaciones no otorga permisos. Los contextos se vuelven a validar al leer la caché; las mutaciones resuelven autoridad vigente. La interfaz recibe sólo permisos de asignaciones efectivas, sin permisos sintéticos por login.

Los roles `viewer`, `editor`, `publisher` y `catalog_manager` administran recursos según su alcance. `integration_manager` requiere emisores o aplicaciones explícitos. `auditor` y `notification_operator` requieren además alcance de consumidores: usar `organizations` para las organizaciones autorizadas y reservar `all_organizations` para operadores que realmente lo necesiten. La lectura global de catálogos no autoriza consultar evidencia global ni modificarla.

Las integraciones y conjuntos de documentos siguen los permisos y alcances de recurso de sus administradores. Las restricciones de consumidores de una integración siguen aplicándose a máquinas/evidencia. El catálogo técnico conserva el servicio dedicado de Console y su actor atestiguado, autorizado previamente por Console. No se cambian roles, asignaciones, políticas de máquinas ni datos automáticamente; no requiere migración de esquema.

## Redis local autenticado en desarrollo

Cuando Vault está habilitado, `cache/redis` sigue definiendo la contraseña y
la base de datos. Si su host remoto no es alcanzable desde el equipo de
desarrollo, se puede usar exclusivamente un transporte local explícito:

```dotenv
REDIS_LOCAL_TRANSPORT=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6381
```

Guardar esos valores en `apps/api/.env.local`, con los secretos existentes de
Vault y `SECRETS_ENABLED=true`. El indicador se rechaza fuera de development/test
y si el host no es loopback. Con el indicador desactivado, el host y puerto de
Vault mantienen su prioridad. No configurar ese indicador en producción.

Con `redis-server` instalado en el equipo, ejecutar desde la raíz:

```bash
bun run dev:redis
bun run dev:api
```

El primer comando inicia una instancia dedicada autenticada, o verifica la
existente sin reiniciarla. Obtiene la contraseña de Vault en memoria, la pasa
a Redis por stdin y exige PONG autenticado y denegación sin contraseña. No
reconfigura otro servidor ni imprime credenciales. La instancia sólo escucha
en loopback y conserva sus sesiones en `.local/redis`, un directorio privado
ignorado por Git que contiene persistencia, PID y log. El comando debe
ejecutarse de nuevo después de reiniciar el equipo.

La API debe devolver 200 en `/health/ready`; el control conserva las
comprobaciones de migraciones, Redis y Event Bus. Para las pruebas del Jest
instalado localmente se usa Node 24.9 o superior (require ESM en VM); no se
modifican dependencias para esta corrección.
