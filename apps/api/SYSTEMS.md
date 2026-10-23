# Sistemas y capacidades

Legal conserva el catálogo; Console lo administra. Identity mantiene identidades OAuth, credenciales y scopes. Las organizaciones y los permisos humanos permanecen en Access o en el sistema consumidor. Ninguna configuración del catálogo contiene secretos.

## Modelo

Un sistema tiene código estable, nombre, estado, servicios y configuración por capacidad. Cada servicio contiene `{code,name,url,audience,resource,enabled}`. `url` es el endpoint completo y `resource` su origen; `audience` identifica la API receptora. Se retiró `verificationAllowed`: las capacidades seleccionan un servicio y Console confirma el destino OAuth que necesita su contrato.

Cada capacidad define un esquema de campos y funciones. El esquema admite string/number/integer/boolean, required, límites, opciones y formatos text/uri/uuid/code/identity-issuer/service. El formato service genera un selector de servicios habilitados del sistema. Cada campo puede declarar functions con una lista no vacía de funciones de la capacidad. Sin esa propiedad aplica a toda la capacidad; con ella, required solo se exige cuando una de esas funciones está activa en un binding habilitado del sistema. Los valores enviados siempre se validan, incluso si su función no está activa. El JSON avanzado tiene exactamente las mismas validaciones. El esquema no ejecuta código ni implementa conectores nuevos.

Las funciones referencian scopes del catálogo Identity mediante `{audience,code}`. Una asociación de cliente contiene `{oauthIssuer,clientId,capabilityCode,roles,enabled}`; `roles` es una lista de códigos de función. Una credencial del backend y ambiente puede atender varias funciones y capacidades. No se crean clientes por función. Los permisos efectivos de todas las funciones se verifican al guardar.

`legalAcceptances` define identityIssuer, productCode y contextService. La presencia de esta configuración activa la capacidad; no tiene un campo enabled adicional. El catálogo permite preparar el sistema sin clientes; activar una integración exige collector autorizado. Los tres campos core se aplican a collector; un backend que solo valida evidencia puede tener legalAcceptances vacío y no crea una fuente de aceptaciones. El runtime collector conserva la validación completa. Sus funciones collector (preparar/registrar) y validator (validar) son datos del catálogo. Solo estas funciones se sincronizan a las autorizaciones de aceptaciones externas conservando IDs históricos.

`payments` define las funciones catalog, checkout, licenses y receiver. Sus campos opcionales productCode, successUrl, cancelUrl, receiverService y checkService conservan las selecciones del asistente. La función receiver autoriza identity.tokens.introspect para comprobar llamadas entrantes con la misma credencial del backend; el resto de funciones usa Billing. Registrar esta capacidad no concede acceso por sí mismo.

## Guardado desde Console

Console requiere administrador de plataforma verificado por Access. Usa su cliente técnico existente `console-identity-admin`, con destinos explícitos Identity, Legal y Billing. Legal exige el cliente configurado en `LEGAL_CATALOG_CLIENT_ID` (default `console-identity-admin`), audiencia legal-api, legal.systems.read/write y el operador verificado que Console adjunta para auditoría.

Console valida primero el sistema mediante `POST /v1/legal/system-catalog/systems/validate?id=...`. Esta operación no escribe ni exige grants que aún deben asignarse. Después configura los permisos y guarda el catálogo; si falla OAuth no se guarda el sistema. Las escrituras entre servicios no son una transacción distribuida: un destino confirmado puede permanecer si falla una operación posterior. Console muestra el paso pendiente y permite reintentarlo con las mismas identidades.

Legal valida los servicios mediante `POST /v1/legal/system-catalog/service-destinations/validate` con `{url}`, devuelve `{resource}` y rechaza protocolos/credenciales/query/fragmentos inválidos. HTTP solo se admite en loopback de desarrollo. La resolución DNS se comprueba al registrar servicios y antes de las llamadas, sin seguir redirecciones ni resolver de nuevo durante la conexión.

El cliente de Legal usa LEGAL_SERVICE_CLIENT_ID/LEGAL_SERVICE_CLIENT_SECRET y necesita Identity introspection y lectura de clientes/scopes. Al seleccionar contexto, Console autoriza legal.consumer_context.read para la audiencia y origen seleccionados. No existe lista de destinos por variable de entorno ni flag específico de verificación en el servicio.

## Conexiones por capacidades

El asistente de Console selecciona sistema/backend, capacidades y funciones del catálogo. Solo solicita los campos aplicables; conserva otras funciones y valores ya configurados. Una capacidad arbitraria guarda configuración y permisos y termina en estado configured: no afirma haber verificado un runtime desconocido.

Los adaptadores conocidos son payments y legalAcceptances. Catálogo de pagos pide producto; licencias añade alcance organizacional; checkout requiere retornos y recolección Legal con aplicación/documentos/contexto; receiver utiliza un servicio receptor registrado. Las opciones Billing y Legal se cargan únicamente cuando son necesarias.

El preset de pagos activa catalog, checkout, licenses, receiver y collector sobre el mismo asistente. Verifica el receptor con la credencial instalada de Billing y el consumidor mediante su SDK instalado. Solo una comprobación real completa devuelve verified y ready=true; configured indica configuración guardada y pending un paso fallido reintentable. Genera PAYMENTS_CONNECTION sin URLs de retorno para funciones que no usan checkout, y usa HEMIA_CLIENT_SECRET separado.

`GET /v1/legal/system-catalog/integration-options` devuelve aplicaciones activas, documentos públicos con versión vigente, publicación HTML y regla de aceptación activa, y las integraciones existentes. Al activar, repite la validación de documentos antes de escribir; la elegibilidad de organización y rol se comprueba con el usuario real durante la aceptación. `PUT /v1/legal/system-catalog/integrations` recibe `{systemId,applicationId,documentIds,enabled?}`; crea o actualiza la única integración de ese sistema de forma idempotente. Bloquea el sistema durante el alta para evitar duplicados concurrentes. El contrato humano de Legal conserva la selección sistema/aplicación/documentos.

La validación externa recibe `{legalAcceptanceId,subjectId,organizationId,productCode}`. Legal deriva la fuente de la aceptación; el consumidor no mantiene mapeos de emisores/aplicaciones. El único contrato de evidencia que utiliza Billing es v2. La respuesta conserva identitySourceId para trazabilidad, no como entrada opcional de compatibilidad.

## Migración explícita

Ejecutar las migraciones con los comandos habituales, nunca en startup. `CapabilityFieldFunctions1792886400000` añade aplicabilidad por funciones a los campos de payments y a los campos collector de legalAcceptances, preservando el resto del esquema. `SystemConnectionFunctions1792800000000` reemplaza role por roles[], retira verificationAllowed, agrega servicios con audience/resource y registra payments. Conserva evidencia y credenciales existentes. Una audiencia ausente no se inventa: debe completarse con el destino real de Identity antes de usar la conexión. El corte no admite rollback parcial; restaurar código/base del ambiente conjuntamente si se necesita deshacer.

Identity `PaymentConnectionScopes1792800000000` registra scopes administrativos y de pagos sin asignar grants. Un scope sin URL necesita configurar su resource antes de utilizarlo para altas. No modifica claims de organizaciones, roles ni permisos en Identity.

Pruebas: API unitarias y `bun run --cwd apps/api test:external:docker` cubren migración PostgreSQL, funciones múltiples, referencias de servicios, aislamiento, evidencia, concurrencia e idempotencia del catálogo. El harness entre repositorios se encuentra en Identity `test/backend/integration/payments-flow.docker.sh`; usa bases temporales, servicios reales y un proveedor PayPal de prueba explícito.
