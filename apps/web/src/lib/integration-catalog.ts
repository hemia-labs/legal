export const integrationsRoot = "/catalogs/integrations";
export const externalAcceptancesPath = `${integrationsRoot}/external-acceptances`;

export const integrationTypes = [
  {
    key: "external-acceptances",
    title: "Aceptaciones externas",
    description: "Conecta aplicaciones para registrar aceptaciones y validar evidencia legal.",
    availability: "Disponible",
  },
  {
    key: "events",
    title: "Eventos y webhooks",
    description: "Consulta el bus de eventos y los canales de comunicación con otros sistemas.",
    availability: "Consulta disponible",
  },
  {
    key: "signatures",
    title: "Firma electrónica",
    description: "Conecta proveedores para enviar contratos y recibir documentos firmados.",
    availability: "Pendiente de implementación",
  },
  {
    key: "connections",
    title: "Conexiones externas",
    description: "Consulta almacenamiento documental y futuras conexiones con notificaciones, CRM y ERP.",
    availability: "Consulta disponible",
  },
] as const;

export type IntegrationType = (typeof integrationTypes)[number]["key"];
