import { describe, expect, test } from "bun:test";
import { applicationKeyFromName } from "../../apps/web/src/lib/application-key";

describe("applicationKeyFromName", () => {
  test("normalizes accents, spaces and symbols", () => {
    expect(applicationKeyFromName("Portal Clientes México")).toBe(
      "app_portal_clientes_mexico",
    );
  });

  test("does not exceed the API limit", () => {
    expect(applicationKeyFromName("Nombre ".repeat(30))).toHaveLength(80);
  });
});
