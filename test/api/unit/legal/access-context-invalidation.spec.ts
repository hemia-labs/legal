import { AccessEventsService } from '../../../../apps/api/src/modules/legal/event-bus/access-events.service';
import { validateAccessEventData } from '../../../../apps/api/src/modules/legal/event-bus/access-event.contracts';
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

const membership = {
  organization_id: 'org',
  membership_id: 'membership',
  identity_reference_id: 'identity',
  identity_issuer: 'issuer',
  subject_id: 'subject',
  context_version: 3,
  reason: 'organization_eligibility_changed',
};
const eligibility = {
  organization_id: 'org',
  previous_type: 'internal',
  type: 'customer',
  eligible_internal: false,
  organization_version: 4,
};
function fixture() {
  const insert = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ raw: [{ event_id: 'event' }] }),
  };
  const consumed = { createQueryBuilder: () => insert };
  const tenants = {
    findOneBy: jest.fn().mockResolvedValue({ id: 'tenant' }),
    save: jest.fn(),
  };
  const memberships = { save: jest.fn() };
  const context = {
    invalidateUser: jest.fn(),
    invalidateOrganization: jest.fn(),
  };
  const dataSource = {
    transaction: (cb: (m: unknown) => unknown) =>
      cb({ getRepository: () => consumed }),
  };
  const service = new AccessEventsService(
    consumed as never,
    context as never,
    dataSource as never,
  );
  return { service, insert, tenants, memberships, context };
}
describe('Access authorization invalidations', () => {
  it('invalidates by trusted identity without synchronizing local roles', async () => {
    const f = fixture();
    await f.service.consume({
      id: 'event',
      type: 'access.membership.context_invalidated.v1',
      data: membership,
    });
    expect(f.context.invalidateUser).toHaveBeenCalledWith('issuer', 'subject');
    expect(f.memberships.save).not.toHaveBeenCalled();
  });
  it.each([
    'access.membership.role_assigned.v1',
    'access.membership.role_revoked.v1',
  ])('only invalidates for %s', async (type) => {
    const f = fixture();
    await f.service.consume({
      id: 'role-event',
      type,
      data: {
        organization_id: 'org',
        identity_issuer: 'issuer',
        subject_id: 'subject',
        role_codes: ['organization_owner'],
      },
    });
    expect(f.context.invalidateUser).toHaveBeenCalledWith('issuer', 'subject');
    expect(f.memberships.save).not.toHaveBeenCalled();
  });
  it('invalidates organization sessions without reactivating or changing tenants', async () => {
    const f = fixture();
    await f.service.consume({
      id: 'event',
      type: 'access.organization.eligibility_changed.v1',
      data: eligibility,
    });
    expect(f.context.invalidateOrganization).toHaveBeenCalledWith('org');
    expect(f.tenants.save).not.toHaveBeenCalled();
  });
  it('retries invalidation when delivery is duplicate after a cache failure', async () => {
    const f = fixture();
    f.context.invalidateUser.mockRejectedValueOnce(new Error('redis down'));
    const event = {
      id: 'event',
      type: 'access.membership.context_invalidated.v1',
      data: membership,
    };
    await expect(f.service.consume(event)).rejects.toThrow('redis down');
    f.insert.execute.mockResolvedValue({ raw: [] });
    await expect(f.service.consume(event)).resolves.toEqual({
      processed: false,
      duplicate: true,
    });
    expect(f.context.invalidateUser).toHaveBeenCalledTimes(2);
  });
  it('rejects incomplete identities, invalid versions and contradictory eligibility', () => {
    expect(() =>
      validateAccessEventData('access.membership.context_invalidated.v1', {
        ...membership,
        identity_issuer: undefined,
      }),
    ).toThrow();
    expect(() =>
      validateAccessEventData('access.membership.context_invalidated.v1', {
        ...membership,
        context_version: 0,
      }),
    ).toThrow();
    expect(() =>
      validateAccessEventData('access.organization.eligibility_changed.v1', {
        ...eligibility,
        eligible_internal: true,
      }),
    ).toThrow();
  });
});
