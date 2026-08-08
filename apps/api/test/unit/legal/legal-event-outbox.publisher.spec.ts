/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { LegalEventOutboxPublisher } from '../../../src/modules/legal/event-bus/legal-event-outbox.publisher';
import { OutboxEvent } from '../../../src/modules/legal/entities/outbox-event.entity';

describe('LegalEventOutboxPublisher', () => {
  it('publishes the event and preserves correlation metadata', async () => {
    const event = {
      id: 'outbox-1',
      traceId: 'trace-1',
      correlationId: 'correlation-1',
      traceParent: '00-trace-parent',
      subject: 'organizations/org-1/products/legal',
      eventType: 'product.organization_product.provisioned.v1',
      payload: { organization_id: 'org-1', product_code: 'legal' },
      status: 'pending',
      attemptCount: 0,
      nextRunAt: null,
      processedAt: null,
      createdAt: new Date(),
    } as OutboxEvent;
    const outbox = {
      find: jest.fn().mockResolvedValue([event]),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const bus = { publish: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn((key: string) =>
        key === 'eventBus.enabled'
          ? true
          : key === 'eventBus.nodeEnv'
            ? 'test'
            : undefined,
      ),
    };
    const publisher = new LegalEventOutboxPublisher(
      outbox as any,
      bus as any,
      config as any,
    );

    await publisher.processPending();

    expect(bus.publish).toHaveBeenCalledWith(event.eventType, event.payload, {
      correlationId: 'correlation-1',
      traceParent: '00-trace-parent',
      subject: 'organizations/org-1/products/legal',
    });
    expect(event.status).toBe('processed');
  });

  it('keeps the event pending after a transient publish failure', async () => {
    const event = {
      id: 'outbox-2',
      traceId: 'trace-2',
      correlationId: null,
      traceParent: null,
      subject: null,
      eventType: 'product.organization_product.provisioning_failed.v1',
      payload: {},
      status: 'pending',
      attemptCount: 0,
      nextRunAt: null,
      processedAt: null,
      createdAt: new Date(),
    } as OutboxEvent;
    const outbox = {
      find: jest.fn().mockResolvedValue([event]),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const bus = {
      publish: jest.fn().mockRejectedValue(new Error('broker down')),
    };
    const config = { get: jest.fn().mockReturnValue(true) };
    const publisher = new LegalEventOutboxPublisher(
      outbox as any,
      bus as any,
      config as any,
    );

    await expect(publisher.processPending()).rejects.toThrow('broker down');
    expect(event.status).toBe('pending');
    expect(event.attemptCount).toBe(1);
  });
});
