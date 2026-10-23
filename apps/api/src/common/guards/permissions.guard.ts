import { LegalConsumerAccessService } from '../../modules/legal/authorization/legal-consumer-access.service';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { isUUID } from 'class-validator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { LegalRequest } from '../types/legal-request';
import { grantsFor } from '../../modules/legal/authorization/legal-authorization';
import {
  scopePredicate,
  type LegalTable,
} from '../../modules/legal/authorization/legal-scope';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DataSource,
    private readonly consumers: LegalConsumerAccessService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (!required.length)
      throw new ForbiddenException('Missing authorization policy');
    const request = context.switchToHttp().getRequest<LegalRequest>();
    for (const permission of required) {
      const grants = grantsFor(request.actor?.authorization, permission);
      const path = String((request.route as { path?: string })?.path ?? '');
      const section = path.replace(/^\/?v1\/legal\//, '').split('/')[0];
      const tables: Record<string, LegalTable> = {
        issuers: 'issuers',
        applications: 'applications',
        documents: 'documents',
        acceptances: 'acceptances',
        notifications: 'notifications',
        'audit-events': 'audit_events',
      };
      let table = tables[section];
      let id: unknown =
        request.params.documentId ??
        request.params.notificationId ??
        request.params.id;
      const body = (request.body ?? {}) as Record<string, unknown>;
      if (
        'productTenantId' in body ||
        (Array.isArray(body.rules) &&
          body.rules.some(
            (r: unknown) =>
              r && typeof r === 'object' && 'productTenantId' in r,
          ))
      )
        throw new BadRequestException('Tenant parameters are not accepted');
      if (request.method === 'POST' && !id) {
        if (section === 'issuers') {
          if (!grants.some((g) => g.resource_scope.type === 'legal_global'))
            throw new ForbiddenException(
              'Global issuer creation authority required',
            );
          continue;
        }
        if (section === 'applications') {
          table = 'issuers';
          id = body.issuerId;
        }
        if (section === 'documents') {
          table = 'applications';
          id = body.applicationId;
        }
      }
      if (id !== undefined) {
        if (typeof id !== 'string' || !isUUID(id) || !table)
          throw new ForbiddenException('Invalid authorization target');
        const predicate = scopePredicate(
          request.actor.authorization,
          permission,
          table,
        );
        const row: Record<string, unknown> | undefined = await this.db
          .createQueryBuilder()
          .select('t.*')
          .from(table, 't')
          .where('t.id = :id', { id })
          .andWhere(predicate.sql, predicate.parameters)
          .getRawOne();
        if (!row) throw new ForbiddenException('Target outside assigned scope');
        if (
          permission === 'legal.notifications.retry' ||
          permission === 'legal.notifications.cancel'
        )
          await this.consumers.organizations(
            [String(row.organization_id)],
            permission === 'legal.notifications.retry',
          );
        if (
          (body.issuerId !== undefined &&
            body.issuerId !== (table === 'issuers' ? row.id : row.issuer_id)) ||
          (request.method === 'PATCH' &&
            body.applicationId !== undefined &&
            body.applicationId !== row.application_id)
        )
          throw new ForbiddenException(
            'Resource reparenting requires a separate authorized operation',
          );
      } else if (!table && section !== 'document-types')
        throw new ForbiddenException('Unsupported authorization target');
    }
    return true;
  }
}
