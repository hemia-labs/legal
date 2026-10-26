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

El catálogo de Sistemas y sus esquemas se administran desde Console; Legal conserva los datos y valida su uso en aceptaciones externas. Ver [contrato, migración y despliegue](apps/api/SYSTEMS.md).

## CI, releases y producción

Ver [DEPLOY.md](DEPLOY.md) para el pipeline, las imágenes, la configuración de GitHub/servidor y las operaciones explícitas de migración, deploy y rollback. Ejecutar `bun run ci` con Node 24, Bun 1.4.4 y Docker para validar el mismo flujo que Actions.
