# Conjuntos de documentos y evidencia de productos

Este contrato es genérico: cada aplicación configura sus claves de conjunto (por ejemplo `registration`, `subscription_checkout` o `policy_update`). Legal conserva las publicaciones y la evidencia; el producto conserva usuarios, sesiones, organizaciones, planes, pedidos y la autorización de sus operaciones.

La creación de documentos no cambia: crear, cargar fuente, revisar y publicar. Los conjuntos referencian esos documentos y resuelven su versión publicada vigente al consultarlos. No se crean documentos específicos de MedSync o Balanz en código, ni se asignan documentos a una aplicación automáticamente.

## Configuración

1. Registrar en el catálogo de Sistemas `configuration.legalAcceptances.identityIssuer` (estable, por ejemplo `urn:hemia:producto`) y `productCode`, y clientes OAuth con funciones `collector` y/o `validator`.
2. Vincular el sistema con la aplicación legal y la lista de documentos permitidos mediante la API existente de integraciones. Ya no se exige una regla de aceptación del motor anterior para habilitar esa vinculación: sí se exige publicación pública vigente con HTML desde el catálogo.
3. Configurar los conjuntos por la API siguiente. No hay pantalla nueva de administración en esta entrega.

```http
GET /v1/legal/applications/{applicationId}/document-sets
PUT /v1/legal/applications/{applicationId}/document-sets/registration
```

Usan la sesión humana de Legal, `legal.documents.view` / `legal.documents.edit` y su alcance de aplicación/emisor. La edición requiere un rol como `legal.editor` en modo de autorización por roles; una sesión limitada a una organización consumidora no puede modificar una política compartida por toda una aplicación.

Ejemplo de creación (sustituir identificadores):

```json
{
  "sourceId": "UUID-integracion",
  "name": "Registro",
  "enabled": true,
  "verification": "collector_attested",
  "requiresOrganization": false,
  "requiresMfa": false,
  "effectiveFrom": "2026-10-29T00:00:00Z",
  "documents": [
    {
      "documentId": "UUID-terminos",
      "requiredAction": "accept",
      "blocking": true,
      "requireReacceptance": true
    },
    {
      "documentId": "UUID-aviso-privacidad",
      "requiredAction": "acknowledge",
      "blocking": true,
      "requireReacceptance": false
    }
  ]
}
```

La respuesta contiene `key`, `applicationId` y `revision` (UUID). Una edición debe enviar `expectedRevision` igual a la revisión leída; un conflicto devuelve 409 `DOCUMENT_SET_CHANGED`. Cada actualización genera otra revisión. `effectiveFrom` determina desde cuándo puede consultarse la configuración guardada; no hay una cola de revisiones programadas: reemplazar una configuración con otra futura deja el conjunto sin consulta pública hasta esa fecha.

Cada documento debe pertenecer a esa aplicación y estar permitido en la integración. Los documentos del conjunto deben estar publicados en el `locale` solicitado (sin sustitución silenciosa de idioma). La clave es arbitraria y no activa comportamiento específico de producto.

`evidenceScope` admite `individual` (predeterminado) u `organization`. El alcance se fija al crear el conjunto. Un conjunto de organización exige `requiresOrganization: true` y `verification: verified_session`. Su revisión se prepara mediante `pending/prepare` con `sessionId` y el producto debe verificar en su callback que la persona puede firmar por esa organización. El snapshot del conjunto para registro público queda reservado al alcance individual. En pendientes e historial, la evidencia de organización cubre a los miembros del mismo consultorio y el historial devuelve `signerSubjectId`. El consumidor debe autenticar al miembro y derivar su organización de su contexto confiable antes de consultar. La validación de un comprobante por firmante en `evidence/validate` conserva su contrato actual.

`requiredAction` permite `accept`, `acknowledge` o `consent`. Todas las acciones configuradas deben confirmarse para registrar ese conjunto completo. No mezclar consentimientos opcionales con requisitos obligatorios de registro; usar otro conjunto para una elección separada. La selección de acciones y documentos es una decisión de la política del producto.

`blocking` y `deadline` (fecha ISO opcional) afectan `allowed` al evaluar pendientes. `requireReacceptance=true` exige la versión/hash actuales; con `false`, una confirmación histórica de ese documento y acción sigue satisfaciendo el requisito. Una nueva publicación ajena al conjunto no genera pendientes. Los cambios de configuración efectivos se aplican a nuevos usuarios y usuarios existentes; no hay segmentación adicional por cohortes.

## Mostrar antes de crear la cuenta

```http
GET /v1/legal/public/{applicationId}/document-sets/registration?locale=es-MX
```

No requiere cuenta ni token de servicio. Devuelve:

```json
{
  "applicationId": "UUID-aplicacion",
  "documentSetKey": "registration",
  "revision": "UUID-revision",
  "snapshotToken": "UUID-snapshot",
  "expiresAt": "2026-10-30T00:00:00.000Z",
  "documents": [
    {
      "documentId": "UUID-documento",
      "documentVersionId": "UUID-version",
      "documentKey": "terms_conditions",
      "title": "Términos y condiciones",
      "version": "1.0.0",
      "contentHash": "SHA256-64-hex",
      "requiredAction": "accept",
      "blocking": true,
      "requireReacceptance": true,
      "deadline": null,
      "artifacts": {
        "html": { "url": "URL-firmada", "expiresAt": "fecha" }
      }
    }
  ]
}
```

`artifacts` conserva el formato del servicio de publicaciones; sus URLs firmadas tienen su propia caducidad. El snapshot fija documentos, versiones, hashes, acciones y reglas, no URLs de descarga. Se reutiliza por conjunto, revisión, idioma y contenido durante una ventana de hasta 24 horas. **No identifica a un visitante ni prueba por sí solo que haya leído o aceptado algo.** La respuesta usa `Cache-Control: no-store`. Si se termina el formulario fuera de la ventana, obtener de nuevo los documentos y sus confirmaciones; nunca cambiar automáticamente los documentos bajo una confirmación anterior.

## Registrar desde el backend del producto

```http
POST /v1/legal/integrations/evidence
Authorization: Bearer TOKEN-TECNICO
```

```json
{
  "snapshotToken": "UUID-snapshot",
  "idempotencyKey": "UUID-evento-estable",
  "subjectId": "usuario-123",
  "occurredAt": "2026-10-29T12:00:00.000Z",
  "confirmations": [
    {
      "documentVersionId": "UUID-version",
      "contentHash": "SHA256-64-hex",
      "action": "accept",
      "confirmed": true
    }
  ]
}
```

Enviar una confirmación por cada documento del snapshot. `organizationId` y `sessionId` son opcionales según la política; las identidades del producto pueden ser cadenas, no solo UUID. El emisor de identidad, producto y permisos del cliente se derivan del catálogo y OAuth. El backend debe derivar sujeto, organización y fecha de su cuenta/sesión/evento; no confiar en los valores de un navegador para elegir otra identidad.

La respuesta 201 contiene `evidenceId`, `snapshotToken`, `recorded`, `occurredAt`, `receivedAt` y `authenticationMethod`. Se guardan confirmaciones, identidad y garantía de verificación, con historial inmutable. La BD rechaza UPDATE/DELETE sobre snapshots y comprobantes.

`collector_attested` permite el alta sin una sesión existente: la evidencia es una declaración autenticada del backend autorizado. No afirma MFA ni verificación del correo del usuario. El producto debe verificar el correo y activar su prueba con su propio flujo.

Para tolerar fallos entre servicios, el producto debe guardar en la misma transacción que crea la cuenta un evento de salida con snapshot, confirmaciones, identidad, fecha y UUID de idempotencia. Su trabajador reintenta exactamente ese evento. Legal acepta recepción posterior a la caducidad si la confirmación ocurrió dentro de la ventana original, siempre que la integración/cliente sigan autorizados. `occurredAt` nunca se sustituye por la fecha del reintento. Repetir el mismo evento devuelve el mismo comprobante; reutilizar la clave con otro contenido devuelve 409 `IDEMPOTENCY_CONFLICT`. La clave se limita a integración y cliente técnico; conservar el cliente de envío al reintentar.

La publicación de una versión nueva después del clic no altera la evidencia capturada. Esa evidencia histórica puede no satisfacer una operación que exige la versión actual. Guardar el comprobante y evaluar pendientes antes de habilitar una operación protegida; no presentar una sincronización fallida como evidencia ya recibida por Legal.

## Consultar pendientes e historial

Las llamadas siguientes son de backend a backend:

```http
POST /v1/legal/integrations/pending/evaluate
POST /v1/legal/integrations/evidence/history
```

```json
{
  "applicationId": "UUID-aplicacion",
  "documentSetKey": "registration",
  "subjectId": "usuario-123",
  "locale": "es-MX"
}
```

Añadir `organizationId` si corresponde. Pendientes devuelve `documentSetKey`, `revision`, `pendingDocuments` con versión/hash/acción/reglas y `reason` (`new_document` o `new_version`), y `allowed` según bloqueos/plazos. Publicar no obliga a todos automáticamente: solo los conjuntos que referencian ese documento y exigen nueva aceptación producen ese pendiente.

Para una cuenta autenticada que revisa actualizaciones, el collector puede enviar la misma consulta a `POST /v1/legal/integrations/pending/prepare`. La respuesta contiene un snapshot con los documentos pendientes y sus artefactos, o `documents: []` sin snapshot cuando no hay pendientes. El snapshot está ligado al collector, sujeto, organización y sesión cuando se proporciona. Enviar a `POST /v1/legal/integrations/evidence` exactamente las confirmaciones de ese snapshot. Los comprobantes previos siguen cubriendo sus documentos según la política vigente. El registro inicial sigue usando el snapshot público completo. Si una operación requiere validar un comprobante único del conjunto completo, debe seguir usando el snapshot completo.

Historial devuelve `items` (comprobante, documentos exactos y confirmaciones) y `nextCursor`; pasar `cursor` para la siguiente página (hasta 100). Está aislado por integración, conjunto, usuario, organización e idioma. Los comprobantes genéricos viven en `legal_evidence_receipts`, separados del registro anterior `acceptances`; se consultan por esta API, no por la pantalla ni exportador anteriores. Los eventos de auditoría se conservan en `audit_events`, pero el listado humano anterior no expone estos nuevos tipos.

## Contratación y verificación del comprobante

Configurar `subscription_checkout` independientemente de `registration`. Puede exigir `requiresOrganization=true`, `verification=verified_session` y `requiresMfa=true` si la política del producto lo requiere. El registro de ese conjunto necesita `sessionId`. Si la verificación es `collector_attested`, no hace falta callback, tampoco en una contratación: seleccionar la garantía apropiada explícitamente.

```http
POST /v1/legal/integrations/evidence/validate
```

Enviar el contexto anterior más `evidenceId`. Requiere cliente `validator`; comprueba aplicación, conjunto, sujeto, organización, idioma, política de verificación y documentos vigentes. Devuelve `valid`, `pendingDocuments`, `productCode` y el comprobante. No alcanza con `allowed`: un plazo puede permitir acceso con documentos pendientes mientras `valid=false`. Un comprobante de registro no valida una contratación, aunque los documentos coincidan.

El producto/Billing debe vincular el comprobante con su propio pedido/contrato y los términos del precio elegidos. Legal no valida planes, importes, disponibilidad de pago ni titularidad de un pedido mediante este contrato.

### Callback para `verified_session`

Configurar `configuration.legalAcceptances.contextService` con un servicio habilitado del sistema: HTTPS público en producción, `audience` explícita y `resource` igual al origen de la URL. Legal obtiene su token técnico con `legal.consumer_context.read` para ese destino. Las mismas restricciones de URL/DNS del motor existente se conservan.

Legal envía (solo campos proporcionados):

```json
{
  "subjectId": "usuario-123",
  "organizationId": "clinica-1",
  "sessionId": "sesion-123",
  "purpose": "document_acceptance",
  "operation": "record",
  "documentSetKey": "subscription_checkout"
}
```

El backend consumidor autentica a Legal, verifica la sesión/identidad y permisos reales para ese conjunto y responde:

```json
{
  "subjectId": "usuario-123",
  "organizationId": "clinica-1",
  "sessionId": "sesion-123",
  "canAcceptDocuments": true,
  "authenticationMethod": "password_email_otp",
  "mfaVerified": false
}
```

En `operation=record` la sesión es obligatoria y MFA se exige si el conjunto lo pide. En `operation=validate` se comprueba la autorización actual y la garantía original almacenada; no se necesita mantener viva la sesión original. Si no se envía una sesión actual, el callback debe verificar la autorización vigente del sujeto/organización para ese conjunto sin inventar una sesión. Si no puede hacerlo, debe denegar. Si se envía `sessionId`, el callback devuelve el mismo identificador. No devolver `canAcceptDocuments=true` solo por reconocer un ID: validar los permisos apropiados. No se usa `canContract` como requisito universal ni se inventa `external_local_mfa` en este contrato.

## Permisos técnicos

Se reutilizan los scopes de Legal existentes; nunca exponer credenciales técnicas en el frontend:

| Operación | Scope OAuth / función |
| --- | --- |
| Registrar evidencia | `legal.integration.acceptances.create` / collector |
| Pendientes e historial | `legal.integration.acceptances.prepare` / collector |
| Validar evidencia | `legal.integration.acceptances.validate` / validator |

Además del scope, cada llamada comprueba la relación cliente/integración/aplicación y su estado, el emisor de identidad del sistema y, si existe, la lista de organizaciones permitidas. Deshabilitar sistema/integración/cliente corta el acceso incluso al repetir eventos anteriores. No se requiere modificar Identity para registrar scopes nuevos.

## Migración, consumidores y pruebas

`DocumentSets1793318400000` crea conjuntos, snapshots y comprobantes inmutables, e introduce `contextService` opcional en el esquema de catálogo. Aplicar explícitamente con el proceso normal del repositorio antes de habilitar consumidores; no se ejecuta al iniciar la API. No configura aplicaciones ni documentos existentes. El `down` elimina las tablas nuevas y su evidencia: usarlo únicamente con una estrategia de recuperación, nunca como limpieza normal.

El [SDK de Node](../../packages/sdk/README.md) cubre la consulta pública y el registro de evidencia. No hay migración automática de comprobantes previos. Las APIs anteriores siguen presentes; su `legalAcceptanceId` no es un `evidenceId` genérico. Balanz/MedSync deben implementar las nuevas consultas, mostrar snapshots, enviar confirmaciones/eventos de salida y guardar `evidenceId` para utilizar este flujo. El callback anterior de `canContract` debe actualizarse si se usa `verified_session`. Billing y su SDK deben adoptar la validación por aplicación/conjunto y la nueva referencia antes de recibir estos comprobantes; el contrato de checkout v2 actual no los consume automáticamente. Coordinar ese cambio entre consumidores antes de cambiar el flujo de pagos. La creación de cuenta de MedSync y sus 15 días de prueba no se modifican en este repositorio.

```sh
bun run --cwd apps/api build
bun run --cwd apps/api lint:check
bun run --cwd apps/api test --runInBand
bun run --cwd apps/api test:document-sets:docker
bun run --cwd apps/api test:external:docker
```

El runner nuevo usa PostgreSQL 18.4 desechable en puerto aleatorio y HTTP de Nest, con identidades sintéticas, almacenamiento firmado simulado y callback controlado. Cubre configuración concurrente, aislamiento, versiones, idempotencia concurrente, entregas tardías, garantías, inmutabilidad y migración. No contacta bases ni proveedores compartidos. La prueba externa recorre las migraciones del esquema completo y la configuración de integraciones sin callback/reglas anteriores. Forma parte de `scripts/legal-checks.sh`.
