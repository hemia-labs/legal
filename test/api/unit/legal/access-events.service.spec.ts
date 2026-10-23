/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { AccessEventsService } from '../../../../apps/api/src/modules/legal/event-bus/access-events.service';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'jwks'),
  jwtVerify: jest.fn(),
}));

describe('AccessEventsService', () => {
  it('processes a duplicate event once', async () => {
    const insert = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest
        .fn()
        .mockResolvedValueOnce({ raw: [{ event_id: 'evt-1' }] })
        .mockResolvedValueOnce({ raw: [] })
        .mockResolvedValueOnce({ raw: [{ event_id: 'evt-2' }] }),
    };
    const consumed = { createQueryBuilder: () => insert };
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
      invalidateOrganization: jest.fn(),
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
      consumed as never,
      context as never,
      dataSource as never,
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

    expect(tenants.save).not.toHaveBeenCalled();
    expect(outbox.save).not.toHaveBeenCalled();
    expect(context.invalidateOrganization).toHaveBeenCalledWith('org-1');
  });
});
