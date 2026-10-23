import { PermanentError } from '@hemia/event-bus';
import { validateAccessEventData } from '../../../../apps/api/src/modules/legal/event-bus/access-event.contracts';

describe('Access event contracts', () => {
  it('accepts enabled Legal without local provisioning or tenant', () => {
    expect(
      validateAccessEventData('access.organization_product.enabled.v1', {
        organization_id: 'org-1',
        product_code: 'legal',
        status: 'enabled',
      }),
    ).toMatchObject({ organization_id: 'org-1' });
    expect(() =>
      validateAccessEventData('access.organization_product.enabled.v1', {
        organization_id: 'org-1',
      }),
    ).toThrow(PermanentError);
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
