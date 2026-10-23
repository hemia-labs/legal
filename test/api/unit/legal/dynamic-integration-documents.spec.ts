import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { SaveIntegrationDto } from '../../../../apps/api/src/modules/legal/integrations/integration.dto';
import { LegalAcceptanceValidationService } from '../../../../apps/api/src/modules/legal/authorization/legal-acceptance-validation.service';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
const issuerId = randomUUID(),
  applicationId = randomUUID(),
  documentId = randomUUID(),
  acceptanceId = randomUUID();
const policy = {
  systemId: randomUUID(),
  applicationId,
  documentIds: [documentId],
};
it('accepts one document and rejects empty, duplicate, malformed or fixed bindings', () => {
  expect(
    validateSync(plainToInstance(SaveIntegrationDto, policy), {
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  ).toHaveLength(0);
  for (const value of [
    { ...policy, documentIds: [] },
    { ...policy, documentIds: [documentId, documentId] },
    { ...policy, documentIds: ['bad'] },
    { ...policy, termsDocumentId: documentId },
    { ...policy, identityIssuer: 'urn:hemia:other' },
    { ...policy, clients: [] },
    { ...policy, issuerId },
  ])
    expect(
      validateSync(plainToInstance(SaveIntegrationDto, value), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }).length,
    ).toBeGreaterThan(0);
});
it('validates current evidence for a dynamic contract with a single document', async () => {
  const query = jest.fn().mockResolvedValue([
    {
      document_id: documentId,
      version_id: randomUUID(),
      version: '1',
      rule_id: randomUUID(),
      specificity: 0,
      acceptance_id: acceptanceId,
      accepted_at: new Date(),
      content_hash: 'a'.repeat(64),
    },
  ]);
  const service = new LegalAcceptanceValidationService(new ConfigService(), {
    query,
  } as unknown as DataSource);
  const result = await service.validate(
    {
      issuerId,
      applicationId,
      organizationId: randomUUID(),
      identityIssuer: 'urn:hemia:balanz',
      subjectId: randomUUID(),
      productCode: 'balanz_cfdi',
      legalAcceptanceId: acceptanceId,
    },
    ['owner'],
    {
      sourceId: randomUUID(),
      contract: { issuerId, applicationId, documentIds: [documentId] },
    },
  );
  expect(result.valid).toBe(true);
  expect(result).not.toHaveProperty('privacyVersion');
  expect(result).toHaveProperty('evidence', [
    expect.objectContaining({ documentId, acceptanceId }),
  ]);
});
