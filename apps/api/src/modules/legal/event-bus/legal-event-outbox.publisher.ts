import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { LegalEventBusClient } from './legal-event-bus.client';
import { OutboxEvent } from '../entities/outbox-event.entity';

const OUTBOUND_TYPES = [
  'product.organization_product.provisioned.v1',
  'product.organization_product.provisioning_failed.v1',
];
const PUBLISH_LEASE_MS = 30_000;
const BACKOFF_MINUTES = [1, 5, 15];

@Injectable()
export class LegalEventOutboxPublisher
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(LegalEventOutboxPublisher.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outbox: Repository<OutboxEvent>,
    private readonly bus: LegalEventBusClient,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (
      !this.config.get<boolean>('eventBus.enabled') ||
      !this.config.get<boolean>('eventBus.outboxPublisherEnabled') ||
      this.config.get<string>('eventBus.nodeEnv') === 'test'
    ) {
      return;
    }
    this.timer = setInterval(() => {
      void this.processPending().catch((error) =>
        this.logger.error(error instanceof Error ? error.message : error),
      );
    }, 30000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processPending(limit = 10) {
    const now = new Date();
    const events = await this.outbox.find({
      where: [
        {
          eventType: In(OUTBOUND_TYPES),
          status: 'pending',
          nextRunAt: IsNull(),
        },
        {
          eventType: In(OUTBOUND_TYPES),
          status: 'pending',
          nextRunAt: LessThanOrEqual(now),
        },
        {
          eventType: In(OUTBOUND_TYPES),
          status: 'processing',
          nextRunAt: IsNull(),
        },
        {
          eventType: In(OUTBOUND_TYPES),
          status: 'processing',
          nextRunAt: LessThanOrEqual(now),
        },
      ],
      order: { createdAt: 'ASC' },
      take: limit,
    });

    for (const event of events) {
      await this.processEvent(event);
    }
    return { processed: events.length };
  }

  private async processEvent(event: OutboxEvent) {
    const claim = await this.outbox
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({
        status: 'processing',
        nextRunAt: new Date(Date.now() + PUBLISH_LEASE_MS),
        attemptCount: () => 'attempt_count + 1',
      })
      .where('id = :id', { id: event.id })
      .andWhere(
        "status IN ('pending', 'processing') AND (next_run_at IS NULL OR next_run_at <= NOW())",
      )
      .andWhere('event_type IN (:...types)', { types: OUTBOUND_TYPES })
      .returning('attempt_count')
      .execute();
    if (!claim.affected) return;
    const attempt = (claim.raw as Array<{ attempt_count: number }>)[0]
      .attempt_count;
    const finish = (values: Parameters<Repository<OutboxEvent>['update']>[1]) =>
      this.outbox
        .createQueryBuilder()
        .update(OutboxEvent)
        .set(values)
        .where('id = :id AND status = :status AND attempt_count = :attempt', {
          id: event.id,
          status: 'processing',
          attempt,
        })
        .execute();

    try {
      await this.bus.publish(event.eventType, event.payload, {
        eventId: event.id,
        occurredAt: event.createdAt.toISOString(),
        correlationId: event.correlationId ?? event.traceId,
        traceParent: event.traceParent ?? undefined,
        subject: event.subject ?? undefined,
      });
      await finish({
        status: 'processed',
        processedAt: new Date(),
        nextRunAt: null,
      });
      this.logger.log(`Published ${event.eventType} (${event.id})`);
    } catch (error) {
      const exhausted = attempt >= BACKOFF_MINUTES.length;
      await finish({
        status: exhausted ? 'failed' : 'pending',
        nextRunAt: exhausted
          ? null
          : new Date(Date.now() + BACKOFF_MINUTES[attempt - 1] * 60_000),
      });
      this.logger.error(
        `Publish failed for ${event.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
