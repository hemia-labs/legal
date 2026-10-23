import { expect, test } from "bun:test";
import { breadcrumbsFor } from "../../apps/web/src/lib/nav";

test("document detail breadcrumb links back to the document list", () => {
  expect(breadcrumbsFor("/documents/9f2c1a")).toEqual([
    { label: "Documentos", href: "/documents" },
    { label: "Detalle del documento" },
  ]);
});

test("document list breadcrumb is the current page", () => {
  expect(breadcrumbsFor("/documents")).toEqual([{ label: "Documentos" }]);
});
