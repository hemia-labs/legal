import { ForbiddenException } from '@nestjs/common';
import { LegalContextService } from '../../../src/modules/legal/services/legal-context.service';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'jwks'),
  jwtVerify: jest.fn(),
}));

describe('LegalContextService', () => {
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    sadd: jest.fn(),
    expire: jest.fn(),
    smembers: jest.fn().mockResolvedValue([]),
    del: jest.fn(),
  };
  const tenants = { findOneBy: jest.fn() };
  const memberships = {
    findOneBy: jest.fn(),
    findBy: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const roles = { findOneBy: jest.fn() };
  const rolePermissions = { findBy: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    tenants.findOneBy.mockResolvedValue({
      id: 'tenant-1',
      status: 'active',
      externalTenantId: 'ext-1',
    });
    memberships.findOneBy.mockResolvedValue(null);
    memberships.create.mockImplementation((value) => value);
    memberships.save.mockImplementation(async (value) => ({
      id: 'membership-1',
      ...value,
    }));
    roles.findOneBy.mockResolvedValue({
      id: 'role-viewer',
      code: 'legal.viewer',
    });
    rolePermissions.findBy.mockResolvedValue([
      { permissionCode: 'legal.documents.view' },
    ]);
  });

  function service() {
    return new LegalContextService(
      redis as any,
      tenants as any,
      memberships as any,
      roles as any,
      rolePermissions as any,
      {
        get: (key: string) =>
          key === 'sso.productCode'
            ? 'legal'
            : key === 'sso.sessionTtlSeconds'
              ? 604800
              : 'legal-api',
      } as any,
    );
  }

  it('stores local permissions from the Access-owned organization context', async () => {
    const result = await service().select(
      {
        user: {
          sub: 'user-1',
          iss: 'https://identity.hemia.test',
          email: '',
          name: '',
        },
        ssoAuth: {
          accessToken: 'identity-token',
          cookie: 'session-1',
          authorization: 'Bearer identity-token',
        },
        accessContext: {
          identity: {
            issuer: 'https://identity.hemia.test',
            subject_id: 'user-1',
            type: 'user',
            identity_reference_id: 'user-1',
          },
          organizations: [
            {
              organization_id: 'org-1',
              organization_code: 'acme',
              organization_name: 'Acme',
              organization_status: 'active',
              membership_id: 'membership',
              membership_status: 'active',
              context_version: 4,
              roles: ['organization_member'],
              permissions: [],
              product: {
                code: 'legal',
                status: 'enabled',
                provisioning_status: 'ready',
                external_tenant_id: 'ext-1',
              },
            },
          ],
        },
      } as any,
      'org-1',
    );

    expect(result).toEqual({
      organizationId: 'org-1',
      externalTenantId: 'ext-1',
      productTenantId: 'tenant-1',
      contextVersion: 4,
      permissions: ['legal.documents.view'],
    });
    expect(result).not.toHaveProperty('contextToken');
    expect(redis.set).toHaveBeenCalledWith(
      'legal:session-context:session-1',
      expect.any(String),
      'EX',
      604800,
    );
    expect(redis.expire).toHaveBeenCalledWith(
      'legal:user-sessions:https://identity.hemia.test:user-1',
      604800,
    );
  });

  it('automatically selects the only available organization on session start', async () => {
    const result = await service().session({
      user: {
        sub: 'user-1',
        iss: 'https://identity.hemia.test',
        email: '',
        name: '',
      },
      ssoAuth: {
        accessToken: 'identity-token',
        cookie: 'session-1',
        authorization: 'Bearer identity-token',
      },
      accessContext: {
        identity: {
          issuer: 'https://identity.hemia.test',
          subject_id: 'user-1',
          type: 'user',
          identity_reference_id: 'user-1',
        },
        organizations: [
          {
            organization_id: 'org-1',
            organization_code: 'acme',
            organization_name: 'Acme',
            organization_status: 'active',
            membership_id: 'membership',
            membership_status: 'active',
            context_version: 4,
            roles: ['organization_member'],
            permissions: [],
            product: {
              code: 'legal',
              status: 'enabled',
              provisioning_status: 'ready',
              external_tenant_id: 'ext-1',
            },
          },
        ],
      },
    } as any);

    expect(result).toMatchObject({
      activeOrganizationId: 'org-1',
      productTenantId: 'tenant-1',
      permissions: ['legal.documents.view'],
    });
    expect(redis.set).toHaveBeenCalledWith(
      'legal:session-context:session-1',
      expect.any(String),
      'EX',
      604800,
    );
  });

  it('rejects an organization that is absent from the Access context', async () => {
    await expect(
      service().select(
        {
          user: {
            sub: 'user-1',
            iss: 'https://identity.hemia.test',
            email: '',
            name: '',
          },
          accessContext: { organizations: [] },
        } as any,
        'org-not-allowed',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
