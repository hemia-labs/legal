export type LegalOrganization = {
  organizationId: string;
  code: string;
  name: string;
  organizationStatus: string;
  membershipStatus: string;
  contextVersion?: number;
  roles?: string[];
  product: {
    code: string | null;
    status: string | null;
    provisioningStatus: string | null;
    externalTenantId: string | null;
  };
};

export type LegalSession = {
  authenticated: boolean;
  user: { email?: string; name?: string };
  organizations: LegalOrganization[];
  activeOrganizationId: string | null;
  productTenantId: string | null;
  permissions: string[];
};
