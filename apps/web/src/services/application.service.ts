import { legalApi } from "@/lib/legal-api";

export type ApplicationStatus = "active" | "inactive" | "archived";
export type ApplicationFilterStatus = ApplicationStatus | "all";

export type Application = {
  id: string;
  issuerId: string;
  key: string;
  name: string;
  status: ApplicationStatus;
  issuer?: { id: string; name: string; status: string };
  createdAt: string;
  updatedAt: string;
};

export type ApplicationListResponse = {
  items: Application[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export function listApplications({
  page = 1,
  limit = 100,
  search,
  status = "all",
  issuerId,
}: {
  page?: number;
  limit?: number;
  search?: string;
  status?: ApplicationFilterStatus;
  issuerId?: string;
} = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search?.trim()) params.set("search", search.trim());
  if (status) params.set("status", status);
  if (issuerId && issuerId !== "all") params.set("issuerId", issuerId);
  return legalApi<ApplicationListResponse>(`/v1/legal/applications?${params.toString()}`);
}

export function createApplication(payload: {
  issuerId: string;
  key: string;
  name: string;
}) {
  return legalApi<Application>("/v1/legal/applications", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateApplication(id: string, payload: { name: string; issuerId: string }) {
  return legalApi<Application>(`/v1/legal/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateApplicationStatus(id: string, status: "active" | "inactive") {
  return legalApi<Application>(`/v1/legal/applications/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function archiveApplication(id: string) {
  return legalApi(`/v1/legal/applications/${id}/archive`, { method: "POST" });
}

export function unarchiveApplication(id: string) {
  return legalApi(`/v1/legal/applications/${id}/unarchive`, { method: "POST" });
}

export function deleteApplication(id: string) {
  return legalApi(`/v1/legal/applications/${id}`, { method: "DELETE" });
}
