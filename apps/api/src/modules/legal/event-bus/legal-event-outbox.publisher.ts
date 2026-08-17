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
    event.status = 'processing';
    await this.outbox.save(event);

    try {
      await this.bus.publish(event.eventType, event.payload, {
        correlationId: event.correlationId ?? event.traceId,
        traceParent: event.traceParent ?? undefined,
        subject: event.subject ?? undefined,
      });
      event.status = 'processed';
      event.processedAt = new Date();
      event.nextRunAt = null;
      await this.outbox.save(event);
      this.logger.log(`Published ${event.eventType} (${event.id})`);
    } catch (error) {
      event.attemptCount += 1;
      event.status =
        event.attemptCount >= BACKOFF_MINUTES.length ? 'failed' : 'pending';
      event.nextRunAt =
        event.status === 'pending'
          ? new Date(
              Date.now() + BACKOFF_MINUTES[event.attemptCount - 1] * 60_000,
            )
          : null;
      await this.outbox.save(event);
      throw error;
    }
  }
}
