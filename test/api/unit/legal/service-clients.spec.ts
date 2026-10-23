import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ServiceClientsService } from '../../../../apps/api/src/modules/legal/service-clients/service-clients.service';
import { parseServicePolicy } from '../../../../apps/api/src/modules/legal/service-clients/service-client.dto';
const issuerId = '12070747-0a73-4256-9556-19b0a56c9340';
const applicationId = '403b298c-4c80-4d5e-afb2-6f703238963d';
const organizationId = 'fd314e96-8274-4e48-a2d4-fb0ae4b719f3';
const grant = {
  operation: 'legal.pending.evaluate',
  issuerId,
  applicationId,
  organizationIds: [organizationId],
};
describe('service client policies', () => {
  it('rejects empty, unknown and malformed policies', () => {
    for (const value of [
      null,
      {},
      { grants: [] },
      { grants: [{ ...grant, operation: '*' }] },
      { grants: [{ ...grant, organizationIds: ['*'] }] },
      { grants: [grant], extra: true },
    ])
      expect(() => parseServicePolicy(value)).toThrow();
    expect(parseServicePolicy({ grants: [grant] }).grants).toHaveLength(1);
  });
  it('accepts omitted or empty organization restrictions but keeps operation and application boundaries', async () => {
    const dynamicGrant = {
      operation: grant.operation,
      issuerId,
      applicationId,
    };
    const policy = parseServicePolicy({ grants: [dynamicGrant] });
    expect(policy.grants[0].organizationIds).toEqual([]);
    expect(() =>
      parseServicePolicy({ grants: [{ ...grant, organizationIds: null }] }),
    ).toThrow();
    const db = {
      getRepository: () => ({
        findOneBy: jest.fn().mockResolvedValue({ policy }),
      }),
    } as unknown as DataSource;
    const service = new ServiceClientsService(db, new ConfigService());
    await expect(
      service.authorize(
        'issuer',
        'client',
        grant.operation,
        issuerId,
        applicationId,
        organizationId,
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.authorize(
        'issuer',
        'client',
        'legal.acceptances.validate',
        issuerId,
        applicationId,
        organizationId,
      ),
    ).rejects.toThrow();
    await expect(
      service.authorize(
        'issuer',
        'client',
        grant.operation,
        issuerId,
        organizationId,
        organizationId,
      ),
    ).rejects.toThrow();
  });
  it('reads fresh policy and never cross-joins destinations or operations', async () => {
    const findOneBy = jest.fn().mockResolvedValue({
      policy: {
        grants: [
          grant,
          {
            ...grant,
            operation: 'legal.acceptances.validate',
            organizationIds: [applicationId],
          },
        ],
      },
    });
    const db = {
      getRepository: () => ({ findOneBy }),
    } as unknown as DataSource;
    const service = new ServiceClientsService(db, new ConfigService());
    await expect(
      service.authorize(
        'issuer',
        'client',
        grant.operation,
        issuerId,
        applicationId,
        organizationId,
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.authorize(
        'issuer',
        'client',
        'legal.acceptances.validate',
        issuerId,
        applicationId,
        organizationId,
      ),
    ).rejects.toThrow();
    findOneBy.mockResolvedValue(null);
    await expect(
      service.authorize(
        'issuer',
        'client',
        grant.operation,
        issuerId,
        applicationId,
        organizationId,
      ),
    ).rejects.toThrow();
    expect(findOneBy).toHaveBeenLastCalledWith({
      oauthIssuer: 'issuer',
      clientId: 'client',
      enabled: true,
    });
  });
});
