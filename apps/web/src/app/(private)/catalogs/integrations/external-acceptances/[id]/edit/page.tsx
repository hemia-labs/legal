import type { Metadata } from "next";
import { IntegrationDetailClient } from "@/components/integrations/integration-detail-client";

export const metadata: Metadata = { title: "Editar integración" };

export default async function EditExternalAcceptancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IntegrationDetailClient key={id} id={id} mode="edit" />;
}
