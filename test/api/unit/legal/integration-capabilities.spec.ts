import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import type { LegalRequest } from '../../../../apps/api/src/common/types/legal-request';
import { LegalEventBusClient } from '../../../../apps/api/src/modules/legal/event-bus/legal-event-bus.client';
import { IntegrationCapabilitiesController } from '../../../../apps/api/src/modules/legal/integrations/integration-capabilities.controller';
import { PERMISSIONS_KEY } from '../../../../apps/api/src/common/decorators/permissions.decorator';

jest.mock('../../../../apps/api/src/common/guards/legal-auth.guard', () => ({
  LegalAuthGuard: class {},
}));

const req = {
  actor: {
    authorization: {
      assignments: [
        {
          role_code: 'legal.integration_manager',
          valid_from: 0,
          expires_at: null,
          resource_scope: { type: 'issuers', ids: ['issuer'] },
          consumer_scope: { type: 'not_applicable', organization_ids: [] },
        },
      ],
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    },
  },
} as unknown as LegalRequest;

function setup(values: Record<string, unknown>) {
  const get = jest.fn(
    (key: string, fallback?: unknown) => values[key] ?? fallback,
  );
  const bus = { isConnected: jest.fn(() => true) };
  const controller = new IntegrationCapabilitiesController(
    { get } as unknown as ConfigService,
    bus as unknown as LegalEventBusClient,
  );
  return { controller, get, bus };
}

it('requires integration viewing authority before reading deployment state', () => {
  const { controller, get, bus } = setup({});
  expect(() => controller.status({ actor: {} } as LegalRequest)).toThrow();
  expect(get).not.toHaveBeenCalled();
  expect(bus.isConnected).not.toHaveBeenCalled();
  const handler: unknown = Object.getOwnPropertyDescriptor(
    IntegrationCapabilitiesController.prototype,
    'status',
  )?.value;
  if (typeof handler !== 'function') throw new Error('Missing status handler');
  expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
    'legal.integrations.view',
  ]);
});

it('reports configured capabilities without exporting credentials or implying storage connectivity', () => {
  const { controller, get } = setup({
    'eventBus.enabled': true,
    'eventBus.outboxPublisherEnabled': true,
    'storage.bucket': 'private-bucket',
    'storage.secretAccessKey': 'secret',
    'eventBus.url': 'amqp://user:secret@broker',
  });
  const result = controller.status(req);
  expect(result.events).toEqual({
    enabled: true,
    connected: true,
    publisherEnabled: true,
    webhooksAvailable: false,
  });
  expect(result.connections.storage).toEqual({
    provider: 's3',
    configured: true,
  });
  expect(result.signatures.available).toBe(false);
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(JSON.stringify(result)).not.toContain('private-bucket');
  expect(get.mock.calls.map(([key]) => key)).not.toContain(
    'storage.secretAccessKey',
  );
});

it('does not report an active publisher or connection when the bus is disabled', () => {
  const { controller, bus } = setup({
    'eventBus.enabled': false,
    'eventBus.outboxPublisherEnabled': true,
  });
  expect(controller.status(req).events).toEqual({
    enabled: false,
    connected: false,
    publisherEnabled: false,
    webhooksAvailable: false,
  });
  expect(bus.isConnected).not.toHaveBeenCalled();
});
