import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EventEnvelope } from '@hemia/event-bus';
import {
  ACCESS_EVENT_BINDINGS,
  ACCESS_EVENT_QUEUE,
  ACCESS_EVENT_TYPES,
  validateAccessEventData,
  type AccessEventData,
  type AccessEventType,
} from '../contracts/access-event.contracts';
import { AccessEventsService } from '../services/access-events.service';
import { LegalEventBusClient } from './legal-event-bus.client';

@Injectable()
export class LegalEventBusConsumer implements OnModuleInit {
  private readonly logger = new Logger(LegalEventBusConsumer.name);

  constructor(
    private readonly bus: LegalEventBusClient,
    private readonly events: AccessEventsService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (!this.config.get<boolean>('eventBus.enabled')) {
      this.logger.warn('Legal Event Bus consumer disabled');
      return;
    }

    const eventBus = await this.bus.connect();
    const prefetch = this.config.get<number>('eventBus.prefetch') ?? 10;

    await eventBus.subscribe<AccessEventData>(
      {
        queue: ACCESS_EVENT_QUEUE,
        bindings: [...ACCESS_EVENT_BINDINGS],
      },
      async (event: EventEnvelope<AccessEventData>) => {
        if (!isKnownAccessEventType(event.type)) {
          this.logger.log(
            JSON.stringify({
              event: 'access_event_ignored',
              reason: 'unsupported_type',
              type: event.type,
              id: event.id,
            }),
          );
          return;
        }

        const data = validateAccessEventData(event.type, event.data);
        this.logger.log(
          JSON.stringify({
            event: 'access_event_received',
            type: event.type,
            id: event.id,
            correlationId: event.correlationId,
            source: event.source,
            subject: event.subject,
            organizationId: stringValue(data.organization_id),
            productCode: stringValue(
              'product_code' in data ? data.product_code : undefined,
            ),
          }),
        );

        const result = await this.events.consume(event);
        this.logger.log(
          JSON.stringify({
            event: 'access_event_processed',
            type: event.type,
            id: event.id,
            duplicate: result.duplicate,
          }),
        );
      },
      { prefetch },
    );
    this.logger.log(
      `Subscribed to ${ACCESS_EVENT_QUEUE} (${ACCESS_EVENT_BINDINGS.join(', ')})`,
    );
  }
}

function isKnownAccessEventType(type: string): type is AccessEventType {
  return (ACCESS_EVENT_TYPES as readonly string[]).includes(type);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}
