import type { Metadata } from "next";
import { IntegrationDetailClient } from "@/components/integrations/integration-detail-client";

export const metadata: Metadata = { title: "Detalle de integración" };

export default async function ExternalAcceptanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IntegrationDetailClient key={id} id={id} />;
}
