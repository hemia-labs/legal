import { expect, test } from "bun:test";
import { breadcrumbsFor } from "../../apps/web/src/lib/nav";

for (const [route, label] of [
  ["external-acceptances", "Aceptaciones externas"],
  ["events", "Eventos y webhooks"],
  ["signatures", "Firma electrónica"],
  ["connections", "Conexiones externas"],
]) {
  test(`integration navigation identifies ${route}`, () => {
    const breadcrumbs = breadcrumbsFor(`/catalogs/integrations/${route}`);
    expect(breadcrumbs.map((item) => item.label)).toEqual(["Catálogos", "Integraciones", label]);
    expect(breadcrumbs.at(-2)?.href).toBe("/catalogs/integrations");
  });
}

test("external acceptance creation returns to its own type instead of the generic catalog", () => {
  const breadcrumbs = breadcrumbsFor("/catalogs/integrations/external-acceptances/new");
  expect(breadcrumbs.at(-2)).toEqual({ label: "Aceptaciones externas", href: "/catalogs/integrations/external-acceptances" });
  expect(breadcrumbs.at(-1)?.label).toBe("Nueva integración");
  expect(breadcrumbsFor("/catalogs/integrations/new").at(-1)?.label).toBe("Nueva integración");
});
