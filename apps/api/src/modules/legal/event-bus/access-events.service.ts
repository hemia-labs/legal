import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PermanentError, type EventEnvelope } from '@hemia/event-bus';
import { DataSource, Repository } from 'typeorm';
import { LegalContextService } from '../session/legal-context.service';
import {
  AccessEventData,
  type AccessMembershipData,
  validateAccessEventData,
} from './access-event.contracts';
import { LegalConsumedAccessEvent } from '../entities/legal-consumed-access-event.entity';

const CONSUMER = 'legal-identity-access-v1';
const PRODUCT = 'legal';

const PRODUCT_STATES: Record<string, string> = {
  'access.organization_product.enable_requested.v1': 'provisioning',
  'access.organization_product.provisioning.v1': 'provisioning',
  'access.organization_product.enabled.v1': 'active',
  'access.organization_product.suspended.v1': 'suspended',
  'access.organization_product.disabled.v1': 'archived',
  'access.organization_product.failed.v1': 'failed',
};

const ORGANIZATION_STATES: Record<string, string> = {
  'access.organization.suspended.v1': 'suspended',
  'access.organization.archived.v1': 'archived',
};

export type AccessEvent = Partial<EventEnvelope<AccessEventData>> & {
  event_id?: string;
  event_type?: string;
  payload?: Record<string, unknown>;
};

type Invalidation =
  | { kind: 'organization'; organizationId: string }
  | { kind: 'user'; issuer: string; subjectId: string };

@Injectable()
export class AccessEventsService {
  constructor(
    @InjectRepository(LegalConsumedAccessEvent)
    private readonly consumed: Repository<LegalConsumedAccessEvent>,
    private readonly context: LegalContextService,
    private readonly dataSource: DataSource,
  ) {}

  async consume(event: AccessEvent) {
    const eventId = event.id ?? event.event_id;
    const eventType = event.type ?? event.event_type;
    if (!eventId || !eventType) {
      throw new PermanentError('Invalid Access event envelope');
    }

    const rawData = event.data ?? event.payload;
    const data = validateAccessEventData(eventType, rawData);
    const result = await this.dataSource.transaction(async (manager) => {
      const inserted = await this.markStarted(
        manager.getRepository(LegalConsumedAccessEvent),
        eventId,
        eventType,
      );
      return { processed: inserted, duplicate: !inserted };
    });
    const invalidation = this.invalidationForEvent(eventType, data);
    if (invalidation) await this.invalidate([invalidation]);
    return result;
  }

  private async markStarted(
    consumed: Repository<LegalConsumedAccessEvent>,
    eventId: string,
    eventType: string,
  ) {
    // ON CONFLICT leaves the transaction usable for duplicate deliveries.
    const inserted = await consumed
      .createQueryBuilder()
      .insert()
      .into(LegalConsumedAccessEvent)
      .values({ eventId, eventType, consumerName: CONSUMER })
      .orIgnore()
      .returning('event_id')
      .execute();
    return (inserted.raw as unknown[]).length > 0;
  }

  private async invalidate(invalidations: Invalidation[]) {
    const unique = new Map<string, Invalidation>();
    for (const invalidation of invalidations) {
      const key =
        invalidation.kind === 'organization'
          ? `organization:${invalidation.organizationId}`
          : `user:${invalidation.issuer}:${invalidation.subjectId}`;
      unique.set(key, invalidation);
    }

    for (const invalidation of unique.values()) {
      if (invalidation.kind === 'user') {
        await this.context.invalidateUser(
          invalidation.issuer,
          invalidation.subjectId,
        );
        continue;
      }
      await this.context.invalidateOrganization(invalidation.organizationId);
    }
  }

  private invalidationForEvent(
    type: string,
    data: AccessEventData,
  ): Invalidation | null {
    if (
      type === 'access.membership.context_invalidated.v1' &&
      'identity_issuer' in data &&
      'subject_id' in data
    ) {
      return {
        kind: 'user',
        issuer: data.identity_issuer,
        subjectId: data.subject_id,
      };
    }
    if (isMembershipData(data)) {
      return {
        kind: 'user',
        issuer: data.identity_issuer,
        subjectId: data.subject_id,
      };
    }
    if ('product_code' in data && data.product_code !== PRODUCT) return null;
    if (
      type === 'access.organization.eligibility_changed.v1' ||
      type in PRODUCT_STATES ||
      type in ORGANIZATION_STATES
    ) {
      return { kind: 'organization', organizationId: data.organization_id };
    }
    return null;
  }
}

function isMembershipData(data: AccessEventData): data is AccessMembershipData {
  return (
    'identity_issuer' in data && 'subject_id' in data && !('reason' in data)
  );
}
