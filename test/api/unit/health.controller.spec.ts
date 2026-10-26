import { LegalHealthController } from '../../../apps/api/src/modules/legal/health.controller';
import type { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import type { Response } from 'express';
import type { ConfigService } from '@nestjs/config';
import type { LegalEventBusClient } from '../../../apps/api/src/modules/legal/event-bus/legal-event-bus.client';

function fixture() {
  const query = jest
    .fn()
    .mockResolvedValueOnce([{ name: 'migrations' }])
    .mockResolvedValue([{ name: 'Initial1' }]);
  const db = { query, migrations: [{ name: 'Initial1' }] };
  const redis = { ping: jest.fn().mockResolvedValue('PONG') };
  const ping = jest.fn().mockResolvedValue(undefined);
  const bus = { connect: jest.fn().mockResolvedValue({ ping }) };
  const config = { get: jest.fn().mockReturnValue(true) };
  const response = { status: jest.fn() };
  const controller = new LegalHealthController(
    db as unknown as DataSource,
    redis as unknown as Redis,
    bus as unknown as LegalEventBusClient,
    config as unknown as ConfigService,
  );
  return {
    controller,
    db,
    redis,
    bus,
    ping,
    config,
    response,
    ready: () => controller.ready(response as unknown as Response),
  };
}

test('readiness checks schema, Redis and RabbitMQ without running migrations', async () => {
  const f = fixture();
  expect(await f.ready()).toEqual({ status: 'ok' });
  expect(f.ping).toHaveBeenCalled();
  expect(
    f.db.query.mock.calls.every(([sql]: [string]) => sql.startsWith('SELECT')),
  ).toBe(true);
});
test('missing migration table and unapplied migrations return pending_migrations', async () => {
  for (const table of [null, 'migrations']) {
    const f = fixture();
    f.db.query
      .mockReset()
      .mockResolvedValueOnce([{ name: table }])
      .mockResolvedValue([]);
    expect(await f.ready()).toEqual({
      status: 'unavailable',
      reason: 'pending_migrations',
    });
    expect(f.response.status).toHaveBeenCalledWith(503);
    expect(f.redis.ping).not.toHaveBeenCalled();
  }
});
test('dependency failure is unavailable without leaking errors', async () => {
  const f = fixture();
  f.redis.ping.mockRejectedValue(new Error('private connection information'));
  expect(await f.ready()).toEqual({
    status: 'unavailable',
    reason: 'dependency_unavailable',
  });
  expect(f.response.status).toHaveBeenCalledWith(503);
});
test('disabled event bus is optional outside production', async () => {
  const f = fixture();
  f.config.get.mockReturnValue(false);
  expect(await f.ready()).toEqual({ status: 'ok' });
  expect(f.bus.connect).not.toHaveBeenCalled();
});
test('hung dependency times out', async () => {
  jest.useFakeTimers();
  try {
    const f = fixture();
    f.db.query.mockReset().mockImplementation(() => new Promise(() => {}));
    const result = f.ready();
    await jest.advanceTimersByTimeAsync(3000);
    expect(await result).toEqual({
      status: 'unavailable',
      reason: 'dependency_unavailable',
    });
    expect(f.response.status).toHaveBeenCalledWith(503);
  } finally {
    jest.useRealTimers();
  }
});
