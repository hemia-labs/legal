import type { AccessContext, AuthenticatedUser } from '@hemia/auth';
import type { RequestAuthContext } from '@hemia/auth/nestjs';
import type { Request } from 'express';

export type LegalContext = {
  organizationId: string;
  externalTenantId: string;
  productTenantId: string;
  contextVersion: number;
  globalRoles: string[];
  permissions: string[];
};

export type LegalActor = {
  identityIssuer: string;
  subjectId: string;
  actorType: 'user' | 'service';
  permissions: string[];
  traceId: string;
};

export type LegalRequest = Request & {
  actor: LegalActor;
  accessContext?: AccessContext;
  user?: AuthenticatedUser;
  ssoAuth?: RequestAuthContext;
  legalContext?: LegalContext;
};
