# Comunicación Access–Legal

Legal consume RabbitMQ mediante `@hemia/event-bus`, cola `hemia-legal.access`, y responde mediante su outbox. Se requiere `EVENT_BUS_ENABLED=true` en desarrollo (en producción está habilitado) y `EVENT_BUS_OUTBOX_PUBLISHER_ENABLED=true` para publicar las respuestas. No se cambiaron variables del despliegue.

## Invalidación

- `access.organization.eligibility_changed.v1`: valida clasificación y versión, e invalida las sesiones de los miembros del tenant local correspondiente.
- `access.membership.context_invalidated.v1`: exige organización, membresía, referencia de identidad, issuer, subject, versión y motivo. Invalida las sesiones de esa identidad, incluso si no existe un tenant local de la organización operadora. Access incluye issuer y subject desde su base, no desde la petición.

Estos avisos no modifican roles locales ni reactivan tenants. Repetirlos o recibirlos fuera de orden solo vuelve a invalidar; no retrocede estados de autorización. El nuevo emisor y verificador de roles de sistema sigue siendo una etapa distinta. Los eventos no sustituyen la expiración ni la revalidación de contextos.

La deduplicación usa el ID estable del evento con `INSERT ON CONFLICT DO NOTHING RETURNING event_id`, sin abortar la transacción al recibir duplicados. Si falla Redis después del commit, una nueva entrega vuelve a intentar invalidar aunque el evento figure consumido.

## Publicación y recuperación

Se conservan `outbox.id` y `createdAt` como identidad y fecha del mensaje en cada reintento. Legal reserva cada registro mediante UPDATE condicional, incrementa `attempt_count` y establece una reserva de 30 segundos en `next_run_at`. Los registros `processing` con reserva vencida o sin fecha se recuperan.

La finalización exige el mismo contador de intento: un proceso cuyo bloqueo venció no puede sobrescribir el estado dejado por su sucesor. El fallo de publicación de un registro no impide procesar el siguiente. Los fallos agotados quedan en `failed`; requieren revisión y reintento operativo explícito, no se borran.

La entrega sigue siendo al menos una vez: si el broker confirmó y el proceso cae antes de guardar el resultado, se republica con el mismo ID. Los consumidores deben deduplicar.

No se ejecutaron migraciones ni seeds; se reutilizan columnas existentes. La validación realizada usa pruebas unitarias y compilación, sin conectarse al broker o a PostgreSQL de despliegue.
