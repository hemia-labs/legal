import { ServiceTokenService } from '../../auth/service-token.service';
import {
  Injectable,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
@Injectable()
export class LegalConsumerAccessService {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenService,
  ) {}
  async resolve(organizationId: string, issuer: string, subject: string) {
    if (
      !isUUID(organizationId) ||
      !subject ||
      issuer !== this.config.getOrThrow<string>('sso.issuer')
    )
      throw new ForbiddenException('Invalid consumer identity');
    const value = await this.call('consumer-context', {
      organization_id: organizationId,
      identity_issuer: issuer,
      subject_id: subject,
    });
    if (
      value.organization_id !== organizationId ||
      value.identity_issuer !== issuer ||
      value.subject_id !== subject ||
      !Array.isArray(value.roles) ||
      !value.roles.every((role) => typeof role === 'string') ||
      !isUUID(String(value.membership_id))
    )
      throw new ServiceUnavailableException('Invalid Access consumer response');
    return { organizationId, roles: value.roles };
  }
  async organizations(ids: (string | null | undefined)[], active = false) {
    if (!ids.length) return;
    if (ids.some((id) => typeof id !== 'string' || !isUUID(id)))
      throw new ForbiddenException('Unverifiable consumer organization');
    const unique = [...new Set(ids as string[])];
    for (let index = 0; index < unique.length; index += 1000) {
      const batch = unique.slice(index, index + 1000);
      if (active && batch.length !== 1)
        throw new ForbiddenException(
          'Active organization check requires one target',
        );
      const value = await this.call(
        active ? 'organization-context' : 'organizations/validate',
        active ? { organization_id: batch[0] } : { organization_ids: batch },
      );
      if (
        typeof value.valid !== 'boolean' ||
        !Array.isArray(value.organization_ids) ||
        !value.organization_ids.every(
          (id) => typeof id === 'string' && batch.includes(id),
        )
      )
        throw new ServiceUnavailableException(
          'Invalid Access organization response',
        );
      if (!value.valid || new Set(value.organization_ids).size !== batch.length)
        throw new ForbiddenException('Consumer organization unavailable');
    }
  }
  private async call(
    path: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      const accessUrl = this.tokens.endpoint(
        this.config.getOrThrow<string>('sso.access.apiBaseUrl'),
      );
      const token = await this.tokens.get(accessUrl.origin, [
        'legal.consumer_context.read',
      ]);
      const result = await fetch(
        new URL('/v1/internal/legal/' + path, accessUrl),
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(3000),
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(input),
        },
      );
      if ([401, 403, 404].includes(result.status))
        throw new ForbiddenException('Consumer access denied');
      if (!result.ok) throw new Error();
      const value: unknown = await result.json();
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error();
      return value as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ServiceUnavailableException(
        'Access consumer authorization unavailable',
      );
    }
  }
}
