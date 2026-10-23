import { postVerificationContext } from './verification-http';
import { ServiceTokenService } from '../../../auth/service-token.service';
import {
  Injectable,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  IntegrationRegistryService,
  ExternalSource,
} from '../registry/integration-registry.service';
@Injectable()
export class ExternalContextService {
  constructor(
    private readonly registry: IntegrationRegistryService,
    private readonly tokens: ServiceTokenService,
  ) {}
  async resolve(
    source: ExternalSource,
    subjectId: string,
    organizationId: string,
    purpose: 'acceptance' | 'checkout_validation',
    sessionId?: string,
  ): Promise<string[]> {
    const url = this.registry.contextUrl(source.context_url);
    let data: Record<string, unknown>;
    try {
      if (!source.context_audience || source.context_resource !== url.origin)
        throw new Error();
      const token = await this.tokens.get(
        source.context_resource,
        ['legal.consumer_context.read'],
        source.context_audience,
      );
      data = (await postVerificationContext(
        url,
        this.registry.production,
        token,
        JSON.stringify({
          subjectId,
          organizationId,
          purpose,
          ...(sessionId ? { sessionId } : {}),
        }),
      )) as Record<string, unknown>;
      if (
        !data ||
        data.subjectId !== subjectId ||
        data.organizationId !== organizationId ||
        !isUUID(data.membershipId) ||
        !Array.isArray(data.roles) ||
        data.roles.length === 0 ||
        data.roles.length > 64 ||
        !data.roles.every(
          (r) => typeof r === 'string' && r.length > 0 && r.length <= 120,
        ) ||
        typeof data.canContract !== 'boolean'
      )
        throw new Error();
    } catch {
      throw new ServiceUnavailableException(
        'External consumer context unavailable',
      );
    }
    if (!data.canContract)
      throw new ForbiddenException('Buyer cannot contract');
    return data.roles as string[];
  }
}
