import { ForbiddenException, Injectable } from '@nestjs/common';
import { LegalRequest } from '../../../common/types/legal-request';

@Injectable()
export class AccessService {
  rolesFromRequest(request: LegalRequest) {
    return [...new Set(request.personalContext?.roles ?? [])];
  }

  ensureRole(requiredRole: string | null, roles: string[]) {
    if (requiredRole && !roles.includes(requiredRole)) {
      throw new ForbiddenException('Missing Access role');
    }
  }
}
