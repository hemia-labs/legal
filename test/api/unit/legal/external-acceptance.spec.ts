import * as verificationHttp from "../../../../apps/api/src/modules/legal/integrations/acceptance/verification-http";
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ValidateExternalEvidenceDto } from "../../../../apps/api/src/modules/legal/integrations/integration.dto";
import { ServiceTokenService } from "../../../../apps/api/src/modules/auth/service-token.service";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { DataSource } from "typeorm";
import { randomUUID } from "node:crypto";
import { IntegrationAuthGuard } from "../../../../apps/api/src/modules/legal/integrations/acceptance/integration-auth.guard";
import { IntegrationRegistryService } from "../../../../apps/api/src/modules/legal/integrations/registry/integration-registry.service";
import { ExternalContextService } from "../../../../apps/api/src/modules/legal/integrations/acceptance/external-context.service";
import {
  ExternalAcceptanceService,
  confirmationHash,
  selectDocuments,
  documentFingerprint,
} from "../../../../apps/api/src/modules/legal/integrations/acceptance/external-acceptance.service";
import type { AcceptExternalDocumentsDto } from "../../../../apps/api/src/modules/legal/integrations/integration.dto";
const ids = Array.from({ length: 20 }, () => randomUUID());
const caller = {
  issuer: "http://localhost:4000",
  clientId: "balanz-billing-service",
  role: "collector" as const,
};
const source = {
  id: ids[0],
  client_record_id: ids[1],
  identity_issuer: "urn:hemia:balanz",
  issuer_id: ids[2],
  application_id: ids[3],
  product_code: "balanz_cfdi",
  context_url: "http://localhost:3021/api/v1/internal/legal/consumer-context",
  context_audience: "balanz-api",
  context_resource: "http://localhost:3021",
  document_ids: [ids[4], ids[5], ids[6]],
};
const docs = [4, 5, 6].map((n, i) => ({
  documentId: ids[n],
  documentVersionId: ids[n + 3],
  acceptanceRuleId: ids[n + 6],
  version: "1",
  contentHash: "a".repeat(64),
  title: "Doc",
  documentType: "custom_policy",
  key: "key" + i,
  locale: "es-MX",
  acceptanceMode: "individual",
  role: null,
  specificity: 0,
}));
const dto: AcceptExternalDocumentsDto = {
  requestId: ids[15],
  subjectId: ids[16],
  organizationId: ids[17],
  sessionId: ids[18],
  idempotencyKey: ids[19],
  confirmations: docs.map((d) => ({
    documentVersionId: d.documentVersionId,
    contentHash: d.contentHash,
    accepted: true,
  })),
};
const original = global.fetch;
afterEach(() => {
  global.fetch = original;
  jest.restoreAllMocks();
});
test("idempotency hash ignores confirmation order but detects changed payload", () => {
  expect(confirmationHash(dto)).toBe(
    confirmationHash({
      ...dto,
      confirmations: [...dto.confirmations].reverse(),
    }),
  );
  expect(confirmationHash(dto)).not.toBe(
    confirmationHash({ ...dto, requestId: ids[0] }),
  );
});
test("jsonb key ordering does not invalidate prepared documents", () => {
  const roundtrip = docs.map((d) =>
    Object.fromEntries(Object.entries(d).reverse()),
  ) as typeof docs;
  expect(documentFingerprint(docs)).toBe(documentFingerprint(roundtrip));
});
test("requires each document, selects specificity, rejects ambiguity", () => {
  expect(selectDocuments(docs, ids.slice(4, 7))).toEqual(docs);
  expect(() => selectDocuments(docs.slice(1), ids.slice(4, 7))).toThrow();
  expect(() => selectDocuments([...docs, docs[0]], ids.slice(4, 7))).toThrow();
  expect(
    selectDocuments(
      [...docs, { ...docs[0], specificity: 2 }],
      ids.slice(4, 7),
    )[0].specificity,
  ).toBe(2);
});
test.each([
  { active: false },
  { sub: ids[16] },
  { session_id: ids[18] },
  { exp: 0 },
  { exp: undefined },
  { aud: "billing-api" },
  { scope: "legal.self.acceptances.create" },
])(
  "rejects inactive, human, expired or wrong-audience tokens %j",
  async (bad) => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          active: true,
          client_id: caller.clientId,
          exp: Date.now() / 1000 + 60,
          aud: "legal-api",
          scope: "legal.integration.acceptances.prepare",
          ...bad,
        }),
      ),
    );
    const config = new ConfigService({
      legalService: {
        introspectionUrl: "http://localhost:4000/oauth/introspect",
        clientId: "legal-service-dev",
        clientSecret: "test",
      },
      sso: { issuer: caller.issuer },
    });
    const guard = new IntegrationAuthGuard(
      config,
      new ServiceTokenService(config),
      {
        getAllAndOverride: () => ["legal.integration.acceptances.prepare"],
      } as unknown as Reflector,
    );
    const req = { headers: { authorization: "Bearer test" } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => null,
      getClass: () => null,
    };
    await expect(guard.canActivate(ctx as never)).rejects.toThrow();
  },
);
test("service token authentication derives caller from trusted introspection", async () => {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        active: true,
        client_id: caller.clientId,
        exp: Date.now() / 1000 + 60,
        aud: "legal-api",
        scope: "legal.integration.acceptances.prepare",
      }),
    ),
  );
  const config = new ConfigService({
    legalService: {
      introspectionUrl: "http://localhost:4000/oauth/introspect",
      clientId: "legal-service-dev",
      clientSecret: "test",
    },
    sso: { issuer: caller.issuer },
  });
  const guard = new IntegrationAuthGuard(
    config,
    new ServiceTokenService(config),
    {
      getAllAndOverride: () => ["legal.integration.acceptances.prepare"],
    } as unknown as Reflector,
  );
  const req = { headers: { authorization: "Bearer test" } };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => null,
    getClass: () => null,
  };
  await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
  expect(req).toMatchObject({ integrationCaller: caller });
});
test("registry fails closed for unknown or ambiguous client policies", async () => {
  const db = { query: jest.fn().mockResolvedValue([]) };
  const registry = new IntegrationRegistryService(
    db as unknown as DataSource,
    new ConfigService({
      legalIntegrations: {
        production: false,
      },
    }),
    {} as never,
  );
  await expect(registry.authorize(caller, ids[17])).rejects.toThrow();
  db.query.mockResolvedValue([source, source]);
  await expect(registry.authorize(caller, ids[17])).rejects.toThrow();
  db.query.mockResolvedValue([source]);
  await expect(registry.authorize(caller, ids[17])).resolves.toEqual(source);
  expect(
    (db.query.mock.calls as unknown as [string, unknown[]][])[2][1],
  ).toEqual([caller.issuer, caller.clientId, "collector", ids[17], null]);
  expect(() =>
    registry.contextUrl(
      "http://evil.test/api/v1/internal/legal/consumer-context",
    ),
  ).toThrow();
  expect(
    registry.contextUrl("http://localhost:3021/custom/verification").pathname,
  ).toBe("/custom/verification");
  expect(() =>
    registry.contextUrl("http://localhost:3021/custom?token=secret"),
  ).toThrow();
});
test.each([
  { canContract: false },
  { subjectId: ids[0] },
  { organizationId: ids[0] },
  { membershipId: "invalid" },
  { roles: [] },
])("context refuses revoked authority and binding mismatch %j", async (bad) => {
  const config = new ConfigService({
    legalIntegrations: {
      production: false,
      tokenUrl: "http://localhost:4000/oauth/token",
      clientId: "reader",
      clientSecret: "test",
    },
  });
  const registry = new IntegrationRegistryService(
    {} as DataSource,
    config,
    {} as never,
  );
  const svc = new ExternalContextService(registry, {
    get: () => Promise.resolve("opaque"),
  } as unknown as ServiceTokenService);
  jest
    .spyOn(verificationHttp, "postVerificationContext")
    .mockResolvedValueOnce({
      subjectId: ids[16],
      organizationId: ids[17],
      membershipId: ids[1],
      roles: ["owner"],
      canContract: true,
      ...bad,
    });
  await expect(
    svc.resolve(source as never, ids[16], ids[17], "acceptance", ids[18]),
  ).rejects.toThrow();
});
function flow(overrides: Record<string, unknown> = {}) {
  const row = {
    id: dto.requestId,
    source_id: source.id,
    client_id: source.client_record_id,
    subject_id: dto.subjectId,
    organization_id: dto.organizationId,
    session_id: dto.sessionId,
    documents: docs,
    expires_at: new Date(Date.now() + 60000),
    result: null,
    ...overrides,
  };
  let acceptanceCount = 0;
  const query: jest.Mock<
    Promise<Record<string, unknown>[]>,
    [string, unknown[]?]
  > = jest.fn((sql: string): Promise<Record<string, unknown>[]> => {
    if (sql.includes("SELECT * FROM external_acceptance_requests WHERE id="))
      return Promise.resolve([row]);
    if (
      sql.includes(
        "SELECT * FROM external_acceptance_requests WHERE source_id=",
      )
    )
      return Promise.resolve([]);
    if (sql.includes("FROM documents d")) return Promise.resolve(row.documents);
    if (sql.includes("INSERT INTO acceptances"))
      return Promise.resolve([{ id: ids[4 + acceptanceCount++] }]);
    return Promise.resolve([]);
  });
  const db = {
    query,
    transaction: jest.fn((fn: (m: unknown) => unknown) =>
      Promise.resolve(fn({ query })),
    ),
  };
  const registry = {
    authorize: jest.fn().mockResolvedValue({
      ...source,
      document_ids: row.documents.map((d) => d.documentId),
    }),
  };
  const context = { resolve: jest.fn().mockResolvedValue(["owner"]) };
  const svc = new ExternalAcceptanceService(
    db as never,
    registry as never,
    context as never,
    {} as never,
    {} as never,
  );
  return { svc, db, query, registry, context, row };
}
test("records all three documents and persists result, calls external context before transaction", async () => {
  const f = flow();
  await expect(f.svc.accept(caller, dto)).resolves.toMatchObject({
    requestId: dto.requestId,
    accepted: true,
  });
  expect(f.context.resolve.mock.invocationCallOrder[0]).toBeLessThan(
    f.db.transaction.mock.invocationCallOrder[0],
  );
  expect(
    f.query.mock.calls.filter(([q]) => q.includes("INSERT INTO acceptances")),
  ).toHaveLength(3);
  expect(
    f.query.mock.calls.some(([q]) => q.includes("SET idempotency_key=")),
  ).toBe(true);
});
test.each([
  { expires_at: new Date(0) },
  { subject_id: ids[0] },
  { organization_id: ids[0] },
  { session_id: ids[0] },
])(
  "expired requests and cross-consumer submissions never insert %j",
  async (bad) => {
    const f = flow(bad);
    await expect(f.svc.accept(caller, dto)).rejects.toThrow();
    expect(
      f.query.mock.calls.some(([q]) => q.includes("INSERT INTO acceptances")),
    ).toBe(false);
  },
);
test("lost-response retry returns persisted result and rejects changed content", async () => {
  const f = flow();
  const result = { legalAcceptanceId: ids[4] };
  f.query.mockImplementation((sql: string) => {
    if (sql.includes("WHERE id=")) return Promise.resolve([f.row]);
    if (sql.includes("WHERE source_id="))
      return Promise.resolve([{ payload_hash: confirmationHash(dto), result }]);
    return Promise.resolve([]);
  });
  await expect(f.svc.accept(caller, dto)).resolves.toEqual(result);
  await expect(
    f.svc.accept(caller, {
      ...dto,
      confirmations: dto.confirmations.map((c, i) => ({
        ...c,
        contentHash: i === 0 ? "b".repeat(64) : c.contentHash,
      })),
    }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  expect(
    f.query.mock.calls.some(([q]) => q.includes("INSERT INTO acceptances")),
  ).toBe(false);
});

test("accepts a single document and rejects missing or extra confirmations", async () => {
  const f = flow({ documents: docs.slice(0, 1) });
  await expect(
    f.svc.accept(caller, {
      ...dto,
      confirmations: dto.confirmations.slice(0, 1),
    }),
  ).resolves.toMatchObject({ accepted: true });
  expect(
    f.query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO acceptances"),
    ),
  ).toHaveLength(1);
  for (const confirmations of [[], dto.confirmations]) {
    const bad = flow({ documents: docs.slice(0, 1) });
    await expect(
      bad.svc.accept(caller, { ...dto, confirmations }),
    ).rejects.toThrow();
    expect(
      bad.query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO acceptances"),
      ),
    ).toBe(false);
  }
});

describe("validation resolves the integration from the acceptance", () => {
  const validator = {
    ...caller,
    clientId: "billing-legal-service",
    role: "validator" as const,
  };
  const request = {
    legalAcceptanceId: ids[15],
    organizationId: ids[17],
    subjectId: ids[16],
    productCode: "balanz_cfdi",
  };
  function fixture() {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes("SELECT external_identity_source_id"))
        return Promise.resolve([{ source_id: source.id }]);
      if (sql.includes("SELECT a.id AS acceptance_id"))
        return Promise.resolve([
          {
            acceptance_id: request.legalAcceptanceId,
            oauth_issuer: caller.issuer,
            client_id: caller.clientId,
          },
        ]);
      return Promise.resolve([]);
    });
    const manager = { query };
    const db = {
      query,
      transaction: (fn: (m: typeof manager) => Promise<unknown>) => fn(manager),
    };
    const registry = { authorize: jest.fn().mockResolvedValue(source) };
    const context = { resolve: jest.fn().mockResolvedValue(["owner"]) };
    const evidence = {
      validate: jest.fn().mockResolvedValue({
        valid: true,
        evidence: [{ acceptanceId: request.legalAcceptanceId }],
        acceptedAt: new Date().toISOString(),
      }),
    };
    const svc = new ExternalAcceptanceService(
      db as never,
      registry as never,
      context as never,
      {} as never,
      evidence as never,
    );
    return { svc, query, registry, context, evidence };
  }
  test("derives the source and rejects the removed caller mapping field", () => {
    expect(
      validateSync(plainToInstance(ValidateExternalEvidenceDto, request), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toHaveLength(0);
    expect(
      validateSync(
        plainToInstance(ValidateExternalEvidenceDto, {
          ...request,
          identitySourceId: source.id,
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      ).length,
    ).toBeGreaterThan(0);
  });
  test("derives the source and authorizes the validator without a caller mapping", async () => {
    const f = fixture();
    await expect(f.svc.validate(validator, request)).resolves.toMatchObject({
      valid: true,
      identitySourceId: source.id,
      issuerId: source.issuer_id,
      applicationId: source.application_id,
    });
    expect(f.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("organization_id=$2 AND subject_id=$3"),
      [request.legalAcceptanceId, request.organizationId, request.subjectId],
    );
    expect(f.registry.authorize).toHaveBeenNthCalledWith(
      1,
      validator,
      request.organizationId,
      source.id,
    );
    expect(f.evidence.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        issuerId: source.issuer_id,
        applicationId: source.application_id,
      }),
      ["owner"],
      expect.objectContaining({ sourceId: source.id }),
      expect.any(Object),
    );
  });
  test("rejects an unknown acceptance or a buyer outside its context", async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([]);
    await expect(f.svc.validate(validator, request)).rejects.toMatchObject({
      status: 403,
    });
    expect(f.registry.authorize).not.toHaveBeenCalled();
    expect(f.context.resolve).not.toHaveBeenCalled();
  });
  test("rejects an unauthorized validator before querying consumer context", async () => {
    const f = fixture();
    f.registry.authorize.mockRejectedValueOnce(
      new Error("Integration target outside client policy"),
    );
    await expect(f.svc.validate(validator, request)).rejects.toThrow(
      "outside client policy",
    );
    expect(f.context.resolve).not.toHaveBeenCalled();
  });
  test("rejects a product outside the derived source", async () => {
    const f = fixture();
    await expect(
      f.svc.validate(validator, { ...request, productCode: "other" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.context.resolve).not.toHaveBeenCalled();
  });
});
