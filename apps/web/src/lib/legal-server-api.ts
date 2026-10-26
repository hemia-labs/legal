import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getApiBaseUrl } from "@/lib/legal-api";

export async function legalServerApi<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const requestHeaders = await headers();
  const requestCookie = requestHeaders.get("cookie");
  const responseHeaders = new Headers(init.headers);

  responseHeaders.set("Accept", "application/json");
  if (init.body && !responseHeaders.has("Content-Type")) {
    responseHeaders.set("Content-Type", "application/json");
  }
  if (requestCookie) responseHeaders.set("Cookie", requestCookie);

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: responseHeaders,
  });

  if (response.status === 401) redirectToLogin(requestHeaders);
  if (!response.ok) {
    throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function redirectToLogin(requestHeaders: Headers): never {
  const loginUrl = new URL("/auth/login", "http://legal.local");
  const raw = requestHeaders.get("x-next-url") ?? requestHeaders.get("next-url") ?? "/";

  try {
    const url = new URL(raw, "http://legal.local");
    loginUrl.searchParams.set("returnTo", `${url.pathname}${url.search}`);
  } catch {
    loginUrl.searchParams.set("returnTo", "/");
  }

  redirect(`${loginUrl.pathname}${loginUrl.search}`);
}
