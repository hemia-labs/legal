import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LegalAuthGuard } from '../../../common/guards/legal-auth.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import type { LegalRequest } from '../../../common/types/legal-request';
import { grantsFor } from '../authorization/legal-authorization';
import { LegalEventBusClient } from '../event-bus/legal-event-bus.client';

@Controller('v1/legal/integration-capabilities')
@UseGuards(LegalAuthGuard)
export class IntegrationCapabilitiesController {
  constructor(
    private readonly config: ConfigService,
    private readonly bus: LegalEventBusClient,
  ) {}

  @Get()
  @Permissions('legal.integrations.view')
  @Header('Cache-Control', 'no-store')
  status(@Req() req: LegalRequest) {
    if (!grantsFor(req.actor?.authorization, 'legal.integrations.view').length)
      throw new ForbiddenException();
    const enabled = this.config.get<boolean>('eventBus.enabled', false);
    return {
      externalAcceptances: { available: true },
      events: {
        enabled,
        connected: enabled && this.bus.isConnected(),
        publisherEnabled:
          enabled &&
          this.config.get<boolean>('eventBus.outboxPublisherEnabled', false),
        webhooksAvailable: false,
      },
      signatures: { available: false },
      connections: {
        storage: {
          provider: 's3',
          configured: Boolean(this.config.get<string>('storage.bucket')),
        },
        notificationsAvailable: false,
        crmAvailable: false,
      },
    };
  }
}
