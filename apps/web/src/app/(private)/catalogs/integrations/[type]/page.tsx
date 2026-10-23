import { notFound } from "next/navigation";
import { IntegrationTypeDetails } from "@/components/integrations/integration-type-details";

export default async function IntegrationTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (type !== "events" && type !== "signatures" && type !== "connections") notFound();
  return <IntegrationTypeDetails type={type} />;
}
