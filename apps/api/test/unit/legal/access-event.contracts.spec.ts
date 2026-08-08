import { PermanentError } from '@hemia/event-bus';
import { validateAccessEventData } from '../../../src/modules/legal/contracts/access-event.contracts';

describe('Access event contracts', () => {
  it('validates product events and requires an external tenant when enabled', () => {
    expect(() =>
      validateAccessEventData('access.organization_product.enabled.v1', {
        organization_id: 'org-1',
        product_code: 'legal',
      }),
    ).toThrow(PermanentError);

    expect(
      validateAccessEventData('access.organization_product.enabled.v1', {
        organization_id: 'org-1',
        product_code: 'legal',
        external_tenant_id: 'tenant-1',
        status: 'enabled',
      }),
    ).toMatchObject({ organization_id: 'org-1' });
  });

  it('does not require product_code for membership events', () => {
    expect(
      validateAccessEventData('access.membership.suspended.v1', {
        organization_id: 'org-1',
        identity_issuer: 'https://issuer.example',
        subject_id: 'user-1',
      }),
    ).toMatchObject({ subject_id: 'user-1' });
  });

  it('requires the final role snapshot for role events', () => {
    expect(() =>
      validateAccessEventData('access.membership.role_revoked.v1', {
        organization_id: 'org-1',
        identity_issuer: 'https://issuer.example',
        subject_id: 'user-1',
      }),
    ).toThrow(PermanentError);
  });
});
