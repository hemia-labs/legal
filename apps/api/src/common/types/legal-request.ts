import type { LegalAuthorization } from '../../modules/legal/authorization/legal-authorization';
import type { AccessContext, AuthenticatedUser } from '@hemia/auth';
import type { RequestAuthContext } from '@hemia/auth/nestjs';
import type { Request } from 'express';

export type LegalContext = {
  organizationId: string;
  contextVersion: number;
  authorization: LegalAuthorization;
  permissions: string[];
};

export type LegalActor = {
  identityIssuer: string;
  subjectId: string;
  actorType: 'user' | 'service';
  permissions: string[];
  traceId: string;
  authorization?: LegalAuthorization;
};

export type LegalRequest = Request & {
  actor: LegalActor;
  accessContext?: AccessContext;
  user?: AuthenticatedUser;
  ssoAuth?: RequestAuthContext;
  legalContext?: LegalContext;
  personalContext?: {
    organizationId: string;
    roles: string[];
    applicationIds?: string[];
  };
};
