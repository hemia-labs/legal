import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { LegalRequest } from '../types/legal-request';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (required.length === 0) return true;

    const request = context.switchToHttp().getRequest<LegalRequest>();
    const granted = request.actor?.permissions ?? [];

    if (!hasAllPermissions(granted, required)) {
      throw new ForbiddenException('Missing required permission');
    }

    return true;
  }
}

function hasAllPermissions(granted: string[], required: string[]): boolean {
  return required.every((permission) =>
    granted.some((candidate) => matches(candidate, permission)),
  );
}

function matches(granted: string, required: string): boolean {
  if (granted === '*.*' || granted === required) return true;
  return granted.endsWith('.*') && required.startsWith(granted.slice(0, -1));
}
