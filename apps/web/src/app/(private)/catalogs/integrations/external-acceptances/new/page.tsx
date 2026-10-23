"use client";

import { useLegalSession } from "@/components/app-shell";
import { IntegrationForm } from "@/components/integrations/integration-form";

export default function NewIntegrationPage() {
  const session = useLegalSession();
  return <IntegrationForm key={`${session.activeOrganizationId}:${session.permissions.join(",")}`} />;
}
