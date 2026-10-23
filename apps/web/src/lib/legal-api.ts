const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3017";

export class LegalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly traceId?: string,
  ) {
    super(message);
    this.name = "LegalApiError";
  }
}

type LogoutResponse = {
  logoutUrl?: string;
};

export async function legalApi<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 401) redirectToLogin();
  if (!response.ok) throw await apiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function legalApiBlob(path: string): Promise<Blob> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    headers: { Accept: "application/octet-stream" },
  });

  if (response.status === 401) redirectToLogin();
  if (!response.ok) throw await apiError(response);
  return response.blob();
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export async function legalLogout(): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw await apiError(response);
  }

  const { logoutUrl } = (await response.json()) as LogoutResponse;
  if (!logoutUrl) throw new Error("Identity logout URL is missing");

  const identityResponse = await fetch(logoutUrl, {
    method: "POST",
    credentials: "include",
  });
  if (!identityResponse.ok) {
    throw await apiError(identityResponse);
  }

}

function redirectToLogin(): never {
  const loginUrl = new URL("/auth/login", apiBaseUrl);
  loginUrl.searchParams.set(
    "returnTo",
    window.location.pathname + window.location.search,
  );
  window.location.assign(loginUrl.toString());
  throw new Error("Redirecting to login");
}

async function apiError(response: Response) {
  const fallback = `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as {
      code?: string;
      message?: string;
      trace_id?: string;
    };
    return new LegalApiError(
      body.message ?? fallback,
      response.status,
      body.code,
      body.trace_id,
    );
  } catch {
    return new LegalApiError(fallback, response.status);
  }
}
