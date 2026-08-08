import { Controller, Get } from '@nestjs/common';
import { LegalEventBusClient } from '../event-bus/legal-event-bus.client';

@Controller('health')
export class LegalEventBusHealthController {
  constructor(private readonly bus: LegalEventBusClient) {}

  @Get('event-bus')
  status() {
    const connected = this.bus.isConnected();
    return {
      service: 'hemia-legal',
      transport: 'rabbitmq',
      status: connected ? 'ok' : 'degraded',
      connected,
    };
  }
}
