# Validación interna de destinos

`POST /v1/internal/authorization/targets/validate` es una consulta de solo lectura para Access. No crea concesiones ni requiere sesión, organización activa o tenant. Access decide la autoridad del administrador; Legal confirma sus propios recursos.

## Contrato

Header: `Authorization: Bearer <token opaco de servicio>`.

```json
{"target_type":"legal_application","ids":["00000000-0000-4000-8000-000000000001"]}
```

Tipos: `legal_issuer` y `legal_application`. Entre 1 y 1.000 UUID únicos, normalizados a minúsculas; se conserva el orden. Los duplicados incluso con distinta capitalización, campos desconocidos y formatos inválidos dan 400. La respuesta 200 lleva `Cache-Control: no-store`:

```json
{"valid":true,"results":[{"id":"00000000-0000-4000-8000-000000000001","target_type":"legal_application","valid":true,"status":"active","issuer_id":"00000000-0000-4000-8000-000000000002","reason":null}]}
```

Razones por prioridad: `not_found` (incluye borrado lógico), `inactive` (estado distinto de active), `parent_unavailable` (aplicación activa cuyo emisor no está habilitado). Un recurso encontrado conserva su estado y, para aplicaciones, el ID real del padre; los ausentes devuelven ambos campos null. Los emisores siempre devuelven issuer_id null. `valid` global exige todos los destinos válidos; Access debe rechazar toda concesión cuando sea false.

Una consulta SQL por lote; las aplicaciones y sus emisores se leen mediante JOIN en el mismo snapshot. No hay caché, escrituras, auditoría/outbox por consulta, ni acceso de Access a la base de Legal. Cambios posteriores al snapshot siguen siendo posibles: el evaluador de Legal deberá revalidar al ejecutar las operaciones. No usar esta respuesta como permiso persistente.

## Clientes y configuración explícitos

Ver [migración al cliente único](../../../../../../docs/legal/service-client-migration.md).

Registrar mediante `POST /api/v1/oauth-clients` de Identity con una sesión de administrador de plataforma:

| clientId | audience | scopes |
| --- | --- | --- |
| access-legal-validator | legal-api | legal.authorization.targets.validate |
| legal-service-dev | identity-api | identity.tokens.introspect |

Ambos: type confidential, status active, grantTypes [client_credentials], responseTypes [], redirectUris [], requiresConsent false. El secreto se devuelve una sola vez: almacenarlo en el gestor de secretos. No rotar ni recrear automáticamente un cliente existente; comprobar su contrato. El secreto del validador pertenece al cliente de Access; Legal usa las credenciales de su cliente único por ambiente, con el destino Identity autorizado para introspección.

Configurar `LEGAL_INTROSPECTION_URL`, `LEGAL_SERVICE_CLIENT_ID=legal-service-dev` y `LEGAL_SERVICE_CLIENT_SECRET`. La ausencia de configuración deniega el endpoint con 503. HTTPS es obligatorio para Identity salvo HTTP loopback en desarrollo; publicar Legal detrás de HTTPS fuera del entorno local.

Access obtiene su token mediante POST /oauth/token con grant_type=client_credentials y el scope de validación. Legal llama POST /oauth/introspect en cada petición con timeout de 3 segundos, sin reintentos ni redirecciones. Requiere active, exp, aud=legal-api, client_id=access-legal-validator y el scope exacto dentro del conjunto de scopes. Rechaza sub/session_id de usuarios. 401: token ausente, inactivo, vencido o humano; 403: audiencia, cliente o scope incorrectos; 503: configuración/introspección indisponible o respuesta inválida. No registra tokens ni secretos.

## Pruebas

Desde apps/api:

```bash
bun run build
bun run test -- --runInBand
bun run test:targets:docker
LEGAL_ACCEPTANCE_CREDENTIALS=/ruta/privada/credentials.json bun run test:targets:docker
```

El último archivo privado (modo 0600) contiene identityUrl, validatorSecret, introspectorSecret e introspectorClientId obligatorio (en desarrollo, legal-service-dev). El arnés exige el cliente explícito del ambiente y no usa clientes retirados como fallback. La prueba obtiene un token real, llama al controlador/guard/servicio reales de Legal, revoca el token y exige 401. Legal corre en un servidor HTTP efímero con PostgreSQL Docker desechable; no usa su BD compartida ni el AppModule completo. Sin el archivo informa SKIP, nunca certifica aceptación real.

El arnés aplica explícitamente las migraciones existentes únicamente en una base vacía legal_targets_test. Prueba estados, borrado lógico, relaciones, lotes mixtos, orden, ausencia de escrituras, cambios de estado frescos, límites y errores de autenticación/timeout. Los contenedores se eliminan al terminar.

Validado 2026-10-21: lint API/web sin incidencias, 119 unitarias API, 14 pruebas web, ambas suites E2E (27 casos), integraciones targets/authorization/external con PostgreSQL desechable y build Nest/Next Turbopack. También pasaron el cliente OAuth real de Billing contra Legal y la aceptación contra Identity real, incluyendo revocación y rechazo posterior. El cliente real de Access verificó destinos válidos y denegó destinos ausentes y padres desactivados. Todas las ramas de aceptación quedaron verificadas; las credenciales no se persisten en el repositorio.

Para repetir la rama Access, indicar además `ACCESS_LEGAL_CLIENT_MODULE` con la ruta absoluta del módulo TypeScript `legal-target-validation.client.ts` de Access. El arnés revoca al terminar los tokens emitidos por ese cliente. Las suites aisladas siguen disponibles sin credenciales externas mediante `test:e2e:isolated` y los runners Docker.
