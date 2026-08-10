import { legalApi } from "@/lib/legal-api";

export type IssuerStatus = "active" | "inactive" | "archived";
export type IssuerFilterStatus = IssuerStatus | "all";

export type Issuer = {
  id: string;
  key: string;
  name: string;
  legalName: string;
  type: string;
  taxId: string | null;
  countryCode: string;
  defaultLocale: string;
  status: IssuerStatus;
  createdAt: string;
  updatedAt: string;
};

export type IssuerListResponse = {
  items: Issuer[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type IssuerOption = Pick<Issuer, "id" | "name" | "status">;

export async function listIssuers({
  page,
  limit,
  search,
  status,
  type,
}: {
  page: number;
  limit: number;
  search?: string;
  status?: IssuerFilterStatus;
  type?: string;
}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search?.trim()) params.set("search", search.trim());
  if (status && status !== "all") params.set("status", status);
  if (type && type !== "all") params.set("type", type);

  return legalApi<IssuerListResponse>(`/v1/legal/issuers?${params.toString()}`);
}

export function listIssuerOptions() {
  return legalApi<IssuerOption[]>("/v1/legal/issuers/options");
}

export function archiveIssuer(id: string) {
  return legalApi(`/v1/legal/issuers/${id}/archive`, { method: "POST" });
}

export function deleteIssuer(id: string) {
  return legalApi(`/v1/legal/issuers/${id}`, { method: "DELETE" });
}

export function updateIssuerStatus(id: string, status: "active" | "inactive") {
  return legalApi(`/v1/legal/issuers/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function unarchiveIssuer(id: string) {
  return legalApi(`/v1/legal/issuers/${id}/unarchive`, { method: "POST" });
}
