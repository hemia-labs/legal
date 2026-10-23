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
  };
};

export type LegalSession = {
  authenticated: boolean;
  user: { email?: string; name?: string };
  organizations: LegalOrganization[];
  activeOrganizationId: string | null;
  permissions: string[];
};
