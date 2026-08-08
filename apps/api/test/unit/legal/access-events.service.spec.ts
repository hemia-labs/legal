/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { QueryFailedError } from 'typeorm';
import { AccessEventsService } from '../../../src/modules/legal/services/access-events.service';
import { OutboxEvent } from '../../../src/modules/legal/entities/outbox-event.entity';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'jwks'),
  jwtVerify: jest.fn(),
}));

describe('AccessEventsService', () => {
  it('processes a duplicate event once', async () => {
    const consumed = {
      create: jest.fn((value) => value),
      insert: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(
          Object.assign(
            new QueryFailedError('insert', [], new Error('duplicate')),
            { driverError: { code: '23505' } },
          ),
        )
        .mockResolvedValueOnce(undefined),
      delete: jest.fn(),
    };
    const tenant = {
      id: 'tenant-1',
      organizationId: 'org-1',
      externalTenantId: 'ext-1',
      status: 'provisioning',
      configuration: {},
    };
    const tenants = {
      findOneBy: jest.fn().mockResolvedValue(tenant),
      save: jest.fn().mockResolvedValue(tenant),
    };
    const memberships = { findOneBy: jest.fn() };
    const roles = {
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 'role-viewer', code: 'legal.viewer' }),
    };
    const outbox = {
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const context = {
      invalidateTenant: jest.fn(),
      invalidateUser: jest.fn(),
      syncMembershipRole: jest.fn(),
    };
    const repositories = new Map([
      ['LegalConsumedAccessEvent', consumed],
      ['LegalProductTenant', tenants],
      ['LegalTenantMembership', memberships],
      ['LegalRole', roles],
      ['OutboxEvent', outbox],
    ]);
    const dataSource = {
      transaction: jest.fn(async (callback) =>
        callback({
          getRepository: (entity: { name: string }) =>
            repositories.get(entity.name),
        }),
      ),
    };
    const service = new AccessEventsService(
      consumed as any,
      tenants as any,
      memberships as any,
      roles as any,
      context as any,
      dataSource as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );
    const event = {
      id: 'evt-1',
      type: 'access.organization_product.enable_requested.v1',
      data: {
        organization_id: 'org-1',
        product_code: 'legal',
      },
    };

    await expect(service.consume(event)).resolves.toEqual({
      processed: true,
      duplicate: false,
    });
    await expect(service.consume(event)).resolves.toEqual({
      processed: false,
      duplicate: true,
    });

    await expect(
      service.consume({
        id: 'evt-2',
        type: 'access.organization_product.failed.v1',
        data: {
          organization_id: 'org-1',
          product_code: 'legal',
        },
      }),
    ).resolves.toEqual({ processed: true, duplicate: false });

    expect(tenants.save).toHaveBeenCalledTimes(2);
    expect(outbox.save).toHaveBeenCalledTimes(2);
    expect(outbox.save.mock.calls.map(([value]) => value.eventType)).toEqual([
      'product.organization_product.provisioned.v1',
      'product.organization_product.provisioning_failed.v1',
    ]);
  });
});
