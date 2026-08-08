/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'jwks'),
  jwtVerify: jest.fn(),
}));

import {
  ACCESS_EVENT_BINDINGS,
  ACCESS_EVENT_QUEUE,
} from '../../../src/modules/legal/contracts/access-event.contracts';
import { LegalEventBusConsumer } from '../../../src/modules/legal/event-bus/legal-event-bus.consumer';

describe('LegalEventBusConsumer', () => {
  it('subscribes to one durable Access queue with all bindings', async () => {
    const subscribe = jest.fn().mockResolvedValue(undefined);
    const bus = {
      connect: jest.fn().mockResolvedValue({ subscribe }),
    };
    const events = { consume: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'eventBus.enabled') return true;
        if (key === 'eventBus.prefetch') return 17;
        return undefined;
      }),
    };
    const consumer = new LegalEventBusConsumer(
      bus as any,
      events as any,
      config as any,
    );

    await consumer.onModuleInit();

    expect(bus.connect).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(
      {
        queue: ACCESS_EVENT_QUEUE,
        bindings: [...ACCESS_EVENT_BINDINGS],
      },
      expect.any(Function),
      { prefetch: 17 },
    );
  });
});
