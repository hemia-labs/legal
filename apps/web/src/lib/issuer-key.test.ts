import { describe, expect, test } from "bun:test";
import { issuerKeyFromName } from "./issuer-key";

describe("issuerKeyFromName", () => {
  test("normalizes accents, spaces and symbols", () => {
    expect(issuerKeyFromName("ÁCME México & Asociados")).toBe(
      "issuer_acme_mexico_asociados",
    );
  });

  test("does not exceed the API limit", () => {
    expect(issuerKeyFromName("Nombre ".repeat(30))).toHaveLength(80);
  });
});
