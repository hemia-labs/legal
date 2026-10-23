# Pruebas de Legal

Todas las pruebas, fixtures y runners viven en `legal/test/`. No agregar pruebas a `src/`, `scripts/` ni a los módulos.

## Estructura

- `api/unit/`: suites Jest por responsabilidad y módulo.
- `api/e2e/`: HTTP de Nest y setup que exige una base aislada.
- `api/integration/`: integraciones PostgreSQL y runners Docker desechables; incluye el helper de evidencia de checkout.
- `api/jest-e2e.json` y `api/tsconfig.json`: configuración de tests de la API.
- `web/`: suites Bun de navegación, formularios, errores SSO y claves de catálogo; `tsconfig.json` conserva los aliases y resolución de dependencias del frontend.

## Comandos

Desde la raíz, `bun run test` ejecuta las unitarias de API y las pruebas web. Por separado:

```sh
bun run --cwd apps/api test
bun run --cwd apps/web test
```

Las integraciones se ejecutan explícitamente con `bun run --cwd apps/api test:targets:docker`, `test:authorization:docker` o `test:external:docker`. Cada runner mantiene el cwd de la API para resolver los módulos y globs de migraciones, y crea/destruye su contenedor PostgreSQL. No deben apuntar a bases compartidas.

`api/.env.example` conserva una plantilla de configuración E2E; exportar sus valores explícitamente antes de ejecutar la suite. `bun run --cwd apps/api test:e2e` requiere servicios/configuración y una base cuyo nombre incluya `test` o `e2e`. El setup rechaza bases compartidas. No ejecutar migraciones ni seeds al arrancar para preparar estas suites. Las integraciones y E2E quedan fuera del comando unitario habitual.

Para ejecutar ambas suites E2E sin configuración externa:

```sh
bun run --cwd apps/api test:e2e:isolated
BILLING_API_ROOT=/ruta/a/billing/apps/api bun run --cwd apps/api test:authorization:docker
```

El runner aislado crea PostgreSQL y Redis desechables en puertos locales aleatorios, ejecuta explícitamente las migraciones y limpia contenedores/volúmenes al terminar. Jest se ejecuta desde un directorio temporal con credenciales sintéticas: no carga los `.env` de la aplicación. El catálogo usa almacenamiento en memoria y una introspección OAuth HTTP local; la suite de autorización verifica por separado los guards y contratos Access/Identity. `BILLING_API_ROOT` activa el cliente real de Billing contra el servidor Legal de prueba. La aceptación contra Identity real y el cliente real de Access también se completaron: token aceptado, revocado y rechazado; destinos ausentes y padres desactivados denegados. Repetir esas ramas requiere credenciales explícitas en un archivo privado temporal; nunca se guardan en el repositorio. Los comandos aislados no contactan proveedores compartidos.

## Aceptación con Identity de pruebas

El runner `test:targets:docker` acepta `LEGAL_ACCEPTANCE_CREDENTIALS` como ruta a un JSON privado con `identityUrl`, `introspectorClientId`, `introspectorSecret` y `validatorSecret`. Usar el cliente activo configurado por Legal; el validador corresponde a `access-legal-validator`. No guardar secretos en el repositorio. `ACCESS_LEGAL_CLIENT_MODULE` puede apuntar al archivo `legal-target-validation.client.ts` de Access para comprobar también su cliente real. Los tokens de la prueba se revocan y el PostgreSQL de Legal sigue siendo desechable; Identity debe apuntar explícitamente al entorno de pruebas.
