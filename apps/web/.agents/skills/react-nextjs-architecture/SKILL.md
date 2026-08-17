---
name: react-nextjs-architecture
description: >
  Arquitectura y buenas prácticas para apps/web con Next.js 16 App Router,
  React 19 y TypeScript. Usar al crear, modificar, revisar o refactorizar rutas,
  layouts, Server y Client Components, hooks, estado, formularios, servicios HTTP,
  Server Actions, Route Handlers, autenticación, manejo de errores, carga de datos,
  caché, metadata, rendimiento, pruebas o estructura de carpetas del frontend.
---

# React / Next.js Architecture

## Objetivo

Implementar cambios pequeños, seguros y coherentes con el frontend existente. Mantener
Server Components como base, separar los límites servidor/cliente y evitar capas,
dependencias o estado global sin una necesidad demostrada.

Stack del proyecto: Next.js 16.3 App Router, React 19, TypeScript estricto, Tailwind CSS v4,
shadcn sobre Base UI y Bun. Aplicar también la skill `frontend-design-system` cuando el cambio
incluya UI o estilos.

## Flujo obligatorio

1. Leer `apps/web/AGENTS.md`, `apps/web/package.json` y los archivos afectados completos.
2. Trazar la ruta desde `page.tsx` o `layout.tsx` hasta componentes, servicios y API.
3. Buscar una implementación o patrón existente antes de crear uno nuevo.
4. Consultar la guía relevante instalada en `apps/web/node_modules/next/dist/docs/` antes de
   usar una API de Next.js; esta versión puede diferir del conocimiento previo.
5. Implementar el cambio en el menor número de archivos que preserve límites correctos.
6. Ejecutar la comprobación mínima relevante y revisar el diff final.

## Decisiones rápidas

- Renderizar en servidor por defecto.
- Añadir `"use client"` solo al componente interactivo más pequeño que necesite estado,
  eventos, efectos o APIs del navegador.
- Leer datos iniciales privados desde un Server Component con `legalServerApi`.
- Ejecutar interacciones del navegador mediante un servicio de dominio que reutilice
  `legalApi`; no duplicar clientes HTTP ni construir URLs de API dentro de componentes.
- Mantener código usado por una sola ruta junto a ella en `_components`, `_lib` o `_actions`.
- Mover código a `src/components`, `src/services` o `src/lib` solo cuando sea compartido o sea
  infraestructura estable.
- Usar Route Handlers o Server Actions solo si Next.js debe mediar secretos, cookies,
  callbacks, uploads o una mutación de servidor. No crear un proxy redundante hacia NestJS.

## Estructura

```text
src/
├── app/                 # rutas, layouts y composición
│   └── .../_components # UI privada de una ruta
├── components/ui/       # primitives shadcn; mantener API base
├── components/          # componentes de aplicación compartidos
├── services/            # operaciones de dominio sobre la API desde cliente
├── lib/                 # infraestructura y utilidades compartidas
└── proxy.ts             # filtro/redirect optimista, no autorización definitiva
```

- Mantener `page.tsx` y `layout.tsx` como puntos de composición; extraer lógica o UI cuando
  oculten el flujo principal, no por tamaño arbitrario.
- Colocar `loading.tsx`, `error.tsx` y `not-found.tsx` en el segmento que posea esos estados.
- No crear carpetas `features`, barrels `index.ts`, repositorios, factories, managers o capas
  genéricas hasta que exista repetición real que las justifique.
- Usar el alias `@/` para imports internos y evitar rutas relativas profundas.
- Mantener dependencias entre capas en una dirección: rutas → componentes/servicios → lib.
  Los primitives de `components/ui` no deben importar lógica de negocio.

## Server y Client Components

- Mantener páginas y layouts como Server Components salvo que toda la ruta sea genuinamente
  interactiva. Preferir una isla cliente dentro de una página servidor.
- Pasar a componentes cliente solo props serializables. No pasar clases, respuestas `Response`,
  objetos con secretos ni funciones normales. Permitir Server Functions `async` marcadas con
  `"use server"` cuando se usen deliberadamente como Server Actions; autorizar dentro de ellas.
- Colocar providers tan abajo como sea posible. Usar contexto solo para estado transversal
  que varias ramas interactivas consumen.
- Marcar módulos con secretos o APIs exclusivas de servidor con `import "server-only"` cuando
  puedan importarse fuera de una entrada claramente servidor.
- En Next.js 16, tratar `params`, `searchParams`, `cookies()` y `headers()` como APIs async.
  Preferir los helpers globales `PageProps<"/ruta">`, `LayoutProps<"/ruta">` y
  `RouteContext<"/ruta">`, generados por `next dev`, `next build` o `next typegen`.
- No usar `useEffect` para datos iniciales que un Server Component puede obtener.

## Datos y API

- Reutilizar `legalServerApi` para lecturas durante render servidor y `legalApi` para llamadas
  desde navegador. Mantener `credentials: "include"` en el cliente común.
- Agrupar endpoints y tipos de cada dominio en `src/services/<dominio>.service.ts` cuando se
  usen desde más de un componente o una operación forme parte del dominio.
- Construir query strings con `URLSearchParams`. Omitir filtros vacíos en vez de enviar valores
  ambiguos.
- Tipar entradas y respuestas; usar `unknown` y estrechar en límites no confiables. No usar
  `any` ni casts para ocultar contratos rotos.
- No instalar una librería de validación para reglas simples. Validar manualmente o con APIs
  nativas; añadir una dependencia solo cuando existan esquemas complejos y repetidos.
- Iniciar lecturas independientes en paralelo con `Promise.all`. Evitar waterfalls entre
  componentes cuando los datos no dependan entre sí.
- No llamar un Route Handler propio desde un Server Component; llamar directamente al backend
  o a la función servidor para evitar un salto HTTP adicional.

## Caché y consistencia

- Asumir el modelo sin Cache Components mientras `next.config.ts` no habilite
  `cacheComponents: true`: `fetch` no se cachea por defecto; usar `cache: "force-cache"`,
  `next: { revalidate, tags }` o `unstable_cache` solo cuando exista una política explícita.
- Tratar sesión, permisos, tenant y datos privados mutables como dinámicos. No cachearlos entre
  usuarios; conservar `cache: "no-store"` salvo política explícita y segura.
- Añadir caché solo para datos compartibles y suficientemente estables. Definir al mismo tiempo
  duración, clave/tenant e invalidación.
- No usar `use cache`, `cacheLife` ni `cacheTag` sin habilitar y migrar conscientemente a Cache
  Components. Usar `revalidatePath` o `revalidateTag` solo para datos realmente cacheados.
- Tras una mutación, actualizar la fuente de verdad y después refrescar o invalidar solo la
  vista afectada. Evitar duplicar datos remotos en múltiples estados cliente.

## Estado, navegación y formularios

- Mantener estado local cerca del control que lo usa. Derivar valores durante render en vez de
  sincronizarlos con efectos.
- Guardar filtros, búsqueda, orden y paginación compartibles en la URL. Usar estado React para
  interacción efímera como diálogos o borradores no navegables.
- No introducir stores globales hasta que estado cliente real de varias rutas no pueda
  resolverse con URL, composición, props o contexto pequeño.
- Usar `next/link` para navegación y `redirect`/`notFound` en servidor. No usar
  `window.location` salvo flujos externos como SSO o descarga.
- Usar validación HTML nativa para reglas simples y validar de nuevo en el límite confiable.
- Mostrar estados pending, éxito y error; deshabilitar submits durante una operación para
  evitar duplicados. Usar optimismo solo si la operación es reversible.
- Autorizar cada Server Action, Route Handler o mutación en el backend; ocultar un botón no es
  una medida de seguridad.

## Errores y estados de ruta

- Modelar errores esperados como resultados visibles y accionables. Reservar excepciones para
  fallos inesperados.
- Reutilizar `LegalApiError` en cliente cuando se necesiten `status`, `code` o `traceId`.
- Usar `notFound()` para recursos inexistentes, `redirect()` para flujo de navegación y
  `error.tsx` para excepciones no recuperadas.
- Tratar `redirect()` y `notFound()` como control de flujo que lanza errores internos. Ejecutar
  `redirect()` fuera de bloques `try/catch`. No capturar `notFound()`; llamarlo durante render o
  desde una función que el componente espere con `await`.
- Implementar `error.tsx` como Client Component con `error` y `retry`. Recordar que no captura
  errores del `layout.tsx` de su mismo segmento; usar un boundary padre o `global-error.tsx`.
- Añadir `loading.tsx` o `Suspense` cuando una lectura lenta bloquearía una parte importante de
  la página. Mantener el fallback cercano al contenido que espera.
- No silenciar errores con `catch {}` salvo que exista un fallback correcto y deliberado.

## Metadata

- Usar el objeto tipado `metadata` para valores estáticos y `generateMetadata` para valores que
  dependan de datos. Exportarlos solo desde Server Components `page.tsx` o `layout.tsx`.
- Preferir la Metadata API y sus convenciones de archivos sobre manipular `<head>` manualmente
  o usar `next/head` en App Router.
- Definir al menos título y descripción adecuados para rutas públicas; añadir canonical, robots
  u Open Graph solo cuando el producto los necesite.

## Seguridad

- Considerar todo dato del navegador como no confiable. Validar identidad, tenant, permisos e
  inputs en API/servidor para cada operación protegida.
- Usar `proxy.ts` y layouts solo para filtros o redirecciones tempranas; nunca como única línea
  de autorización.
- No exponer tokens, secretos ni modelos internos completos a Client Components. Recordar que
  cualquier variable `NEXT_PUBLIC_*` es pública.
- No guardar credenciales o tokens en `localStorage`. Conservar sesiones en cookies HttpOnly y
  enviar cookies con `credentials: "include"`.
- No usar `dangerouslySetInnerHTML` con contenido externo sin sanitización explícita.
- No cachear respuestas privadas sin incluir correctamente identidad y tenant en el aislamiento.

## React y TypeScript

- Escribir componentes funcionales con props explícitas y pequeñas. Preferir composición sobre
  props booleanas que multipliquen variantes.
- Mantener una única fuente de verdad. No copiar props a estado ni guardar valores derivables.
- Usar claves estables de dominio en listas; nunca índices si el orden puede cambiar.
- Evitar `useMemo`, `useCallback` y `memo` por defecto. Añadirlos solo por identidad semántica o
  una medición que demuestre beneficio.
- Evitar efectos para transformar datos, responder a eventos o sincronizar estado React entre
  sí; realizar cada trabajo en render, en el handler o en la fuente de datos correspondiente.
- Preferir tipos de dominio concretos, uniones discriminadas y `satisfies`. Mantener los casts
  cerca del límite que los obliga.
- No desactivar TypeScript, ESLint ni reglas de hooks para terminar un cambio.

## Rendimiento y accesibilidad

- Reducir JavaScript cliente manteniendo pequeños los límites `"use client"`.
- Usar `next/image`, `next/font`, `next/link` y lazy loading nativo de Next cuando corresponda.
- Importar módulos pesados dinámicamente solo si quedan fuera del camino inicial y la medición
  justifica la complejidad.
- Evitar dependencias nuevas para utilidades cubiertas por plataforma, React, Next.js o paquetes
  ya instalados.
- Mantener HTML semántico, navegación por teclado, foco visible, labels y estados anunciables.
  Seguir `frontend-design-system` para reglas visuales y de componentes.

## Verificación

- Ejecutar `bun run --cwd apps/web lint` para cambios locales de TypeScript/React.
- Ejecutar `bun run --cwd apps/web build` cuando cambien rutas, límites server/client,
  configuración, datos o comportamiento de producción.
- Probar lógica pura no trivial con Bun usando un test pequeño junto a `src/lib`; no añadir un
  framework nuevo si `bun test` cubre el caso.
- Comprobar manualmente happy path, loading, empty, error y permisos cuando el cambio los toque.
- Revisar que el diff no incluya `.next`, `node_modules`, `tsconfig.tsbuildinfo` ni cambios ajenos.

## Checklist final

- Server Component por defecto y límite cliente mínimo.
- Sin duplicar clientes HTTP, estado remoto ni abstracciones.
- Autorización en el límite servidor/API, no solo en UI.
- Caché privada segura o desactivada.
- Estados loading/empty/error cubiertos cuando aplican.
- Tipos de ruta generados, metadata pública, accesibilidad y documentación Next.js 16 verificadas.
- Lint y build correctos según el riesgo del cambio.
