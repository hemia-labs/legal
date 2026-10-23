import { LegalEventOutboxPublisher } from '../../../../apps/api/src/modules/legal/event-bus/legal-event-outbox.publisher';
import { OutboxEvent } from '../../../../apps/api/src/modules/legal/entities/outbox-event.entity';

function fixture(affected = 1, attempt = 1) {
  const event = {
    id: 'outbox-id',
    eventType: 'product.organization_product.provisioned.v1',
    payload: {},
    createdAt: new Date('2026-09-15T00:00:00Z'),
    traceId: 'trace',
    status: 'pending',
  } as OutboxEvent;
  const builder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest
      .fn()
      .mockResolvedValue({ affected, raw: [{ attempt_count: attempt }] }),
  };
  const outbox = {
    find: jest.fn().mockResolvedValue([event]),
    createQueryBuilder: () => builder,
  };
  const bus = { publish: jest.fn().mockResolvedValue(undefined) };
  const publisher = new LegalEventOutboxPublisher(
    outbox as never,
    bus as never,
    { get: jest.fn() } as never,
  );
  return { publisher, event, outbox, bus, builder };
}
describe('Legal outbox recovery', () => {
  it('preserves outbox identity/time and fences completion by claimed attempt', async () => {
    const f = fixture(1, 3);
    await f.publisher.processPending();
    expect(f.bus.publish).toHaveBeenCalledWith(
      f.event.eventType,
      f.event.payload,
      expect.objectContaining({
        eventId: f.event.id,
        occurredAt: f.event.createdAt.toISOString(),
      }),
    );
    expect(f.builder.where).toHaveBeenLastCalledWith(
      expect.stringContaining('attempt_count = :attempt'),
      { id: f.event.id, status: 'processing', attempt: 3 },
    );
    expect(f.builder.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'processed' }),
    );
  });
  it('does not publish when another replica owns the reservation', async () => {
    const f = fixture(0);
    await f.publisher.processPending();
    expect(f.bus.publish).not.toHaveBeenCalled();
  });
  it('includes abandoned processing records and tests lease expiry atomically', async () => {
    const f = fixture();
    f.event.status = 'processing';
    await f.publisher.processPending();
    const query = (
      f.outbox.find.mock.calls as unknown as Array<[unknown]>
    )[0][0] as {
      where: Array<{ status: string }>;
    };
    expect(
      query.where.filter((row) => row.status === 'processing'),
    ).toHaveLength(2);
    expect(f.builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('next_run_at <= NOW()'),
    );
    expect(f.bus.publish).toHaveBeenCalledTimes(1);
  });
  it('backs off without preventing other events from being published', async () => {
    const f = fixture();
    f.outbox.find.mockResolvedValue([f.event, { ...f.event, id: 'next' }]);
    f.bus.publish.mockRejectedValueOnce(new Error('broker down'));
    await f.publisher.processPending();
    expect(f.bus.publish).toHaveBeenCalledTimes(2);
    expect(f.builder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        nextRunAt: expect.any(Date) as unknown,
      }),
    );
  });
  it('leaves exhausted failures observable instead of retrying forever', async () => {
    const f = fixture(1, 3);
    f.bus.publish.mockRejectedValue(new Error('broker down'));
    await f.publisher.processPending();
    expect(f.builder.set).toHaveBeenLastCalledWith({
      status: 'failed',
      nextRunAt: null,
    });
  });
});
