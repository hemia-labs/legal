# Publicación y despliegue de Hemia Legal

El flujo sigue Billing y Access: PR funcional → CI → PR de versión → release inmutable `legal-vX.Y.Z` → despliegue opcional al entorno `prod` por Tailscale OIDC y SSH. Las imágenes privadas `legal/api` y `legal/web` se despliegan por digest; el servidor no compila ni necesita un checkout.

## Validación

Usar Node 24, Bun 1.4.4, Python 3 y Docker Compose v2 con soporte para `env_file.format: raw` y `config --no-env-resolution`.

```sh
bun run ci
```

Este comando instala con lockfile congelado, valida el versionado y la recuperación del deploy, ejecuta lint, unitarias, E2E e integraciones contra contenedores desechables y construye/prueba las imágenes de producción. Los tests no necesitan credenciales compartidas. `test/docker/smoke.py` comprueba readiness antes/después de migrar explícitamente, proxy HTTP, autenticación denegada, usuario sin privilegios, reinicio y pérdida de Redis. No ejecuta seeds.

## Versionado

API y web empiezan alineadas en `0.1.0` y se versionan juntas con Changesets. Cada cambio publicable debe agregar un changeset:

```sh
bun run changeset
```

Al integrar el cambio en `main`, `legal-release.yml` valida el proyecto y crea o actualiza `changeset-release/legal`. Al integrar ese PR se vuelve a ejecutar el CI, se publican las imágenes con el commit en su etiqueta OCI y se crea una release con `release.json`, `compose.json` y `legal-deploy.py`. Los assets llevan checksums y el manifiesto registra los hashes de las migraciones.

El changeset inicial incluido genera la primera release. No ejecutar `version:legal` en un PR funcional: ese comando pertenece al PR de versión. El publicador puede reanudar imágenes o borradores incompletos del mismo commit, pero rechaza reemplazar imágenes/assets incompatibles. Una release publicada e inmutable se reutiliza sin cambios.

Para reintentar una publicación, ejecutar manualmente **Legal release** en el commit de versión de `main`, indicando su tag exacto. El tag debe coincidir con la versión de ambos paquetes.

## Configuración de GitHub

Crear el environment **prod**, habilitar releases inmutables y permitir a Actions crear PRs. Configurar reglas de protección de `main` para exigir **Legal CI / legal**. Restringir los despliegues del environment a `main`.

Variables del environment `prod`:

| Variable | Uso |
| --- | --- |
| `REGISTRY_HOST` | Hostname del registry privado, sin esquema ni ruta |
| `REGISTRY_USERNAME` | Usuario con permiso de publicar `legal/api` y `legal/web` |
| `TS_CLIENT_ID`, `TS_AUDIENCE` | Integración OIDC de Tailscale usada en Billing/Access |
| `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT` | Host de Tailscale, usuario dedicado y puerto SSH (22 por defecto) |
| `DEPLOY_PATH` | Directorio absoluto existente, por ejemplo `/opt/hemia-legal` |
| `ENABLE_LEGAL_DEPLOY` | `true` solo después de provisionar el host; controla también las operaciones manuales |

Secrets del environment `prod`: `REGISTRY_PASSWORD`, `DEPLOY_SSH_PRIVATE_KEY` y `DEPLOY_SSH_KNOWN_HOSTS`. La clave del host SSH debe verificarse por un canal confiable; el workflow exige `StrictHostKeyChecking=yes`.

Para que el PR de versión creado automáticamente dispare otros workflows, configurar la variable de repositorio `RELEASE_APP_CLIENT_ID` y el secret `RELEASE_APP_PRIVATE_KEY` de una GitHub App instalada en `legal`, con permisos Contents y Pull requests de escritura. El job de versión no usa el environment `prod`: estos dos valores deben estar a nivel repositorio. Sin esa App usa `GITHUB_TOKEN`, cuyos cambios no disparan automáticamente todos los eventos de Actions; en ese caso ejecutar CI manualmente para el PR de versión.

Tailscale debe permitir `tag:hemia-ci` acceder al registry y al SSH del servidor. El host debe tener una sesión de Docker con credenciales de solo lectura para el mismo registry. Arquitectura de despliegue: Linux amd64, igual que el runner de publicación `ubuntu-24.04`.

## Preparación del servidor

Instalar Docker/Compose y Python 3. El usuario de despliegue necesita acceso a Docker y escritura en `DEPLOY_PATH`. Crear `shared/production.env` con modo `600` o `400`, y `shared/host.json`:

```json
{
  "registry_host": "registry.tail41610c.ts.net",
  "bind_address": "127.0.0.1",
  "http_port": 8082,
  "public_url": "https://legal.hemia.cloud"
}
```

El proxy HTTPS del servidor debe enviar **todas** las rutas del origen público a `127.0.0.1:8082`, incluidas `/auth/*`, `/v1/*` y `/health/*`. Next.js conserva la página `/auth/error` y reenvía las demás rutas de API/auth al contenedor API. La API no publica un puerto del host. `LEGAL_API_URL` se configura al arrancar el frontend; la imagen no requiere un dominio público al compilar.

`shared/production.env` debe incluir los valores reales de la plantilla `apps/api/.env.example`:

- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`: PostgreSQL accesible desde Docker. Se requieren también para las migraciones/preflight, incluso si la aplicación obtiene sus credenciales desde Vault. Deben identificar la **misma** base de datos.
- Redis, S3 y RabbitMQ: `REDIS_*`, `S3_*`, `AMQP_URL`. RabbitMQ es obligatorio en producción. Los archivos legales se guardan en S3; el filesystem del contenedor es de solo lectura.
- Identity/Access: `SSO_ISSUER`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_AUDIENCE`, `ACCESS_API_URL` y los clientes técnicos `LEGAL_SERVICE_*` que use la instalación.
- `SSO_REDIRECT_URI=https://legal.hemia.cloud/auth/callback`, `SSO_FRONTEND_URL=https://legal.hemia.cloud`, `SSO_COOKIE_NAME=legal_session` y cookies seguras. Registrar este callback en Identity. Mantener el nombre de cookie predeterminado usado por el frontend.
- Vault: `SECRETS_ENABLED`, `SECRETS_ENVIRONMENT=prod`, `SECRETS_CATEGORY`, `SECRETS_OWNER`, `SECRETS_SYSTEM`, `VAULT_BASE_URL`, `VAULT_ROLE_ID`, `VAULT_SECRET_ID` y los paths correspondientes. El módulo de secrets requiere una configuración válida al construirse, también cuando se desactiva su uso para DB/Redis/S3.

Usar hosts de red accesibles desde contenedores; `localhost` dentro de la API apunta al propio contenedor. Compose incluye `host.docker.internal` para servicios residentes en el host. No copiar `.env`, llaves ni credenciales a las imágenes o releases.

## Migraciones, deploy y rollback

En **Legal deployment**, seleccionar `main`, el tag publicado y una operación:

- `migrate`: comprobar un backup y escribir `I_HAVE_A_BACKUP` en `backup_confirmation`. Ejecuta únicamente las migraciones de la imagen seleccionada; no promueve la release ni ejecuta seeds.
- `deploy`: valida checksums, tag/commit y digests; comprueba migraciones pendientes antes de reemplazar los contenedores, espera healthchecks y verifica el readiness por HTTPS público.
- `rollback`: seleccionar una versión anterior. No revierte migraciones. Si los conjuntos de migraciones difieren, revisar la compatibilidad y marcar `acknowledge_schema`.

En la primera instalación: publicar → respaldar/provisionar la base → `migrate` → `deploy`. En despliegues posteriores con nuevas migraciones, aplicarlas explícitamente antes del deploy. Nunca se ejecutan migraciones o seeds al arrancar. `/health/ready` responde `503` con `reason=pending_migrations` si falta aplicar alguna; también comprueba Redis y el broker obligatorio con un límite de tiempo.

`ENABLE_LEGAL_DEPLOY=true` activa el despliegue tras publicar. Si está desactivado la release queda publicada sin tocar el servidor. Un fallo de health restaura la release anterior automáticamente solo si el conjunto de migraciones coincide. Las releases, enlaces `current`/`previous` e historial `history.jsonl` quedan en `DEPLOY_PATH`; las operaciones se serializan con un lock del host y la concurrencia del workflow.
