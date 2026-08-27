import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from './entities/audit-event.entity';
import { LegalAcceptance } from './entities/legal-acceptance.entity';
import { LegalAcceptanceRule } from './entities/legal-acceptance-rule.entity';
import { LegalApplication } from './entities/legal-application.entity';
import { LegalDocument } from './entities/legal-document.entity';
import { LegalDocumentVersion } from './entities/legal-document-version.entity';
import { LegalIssuer } from './entities/legal-issuer.entity';
import { LegalNotification } from './entities/legal-notification.entity';
import { LegalPublication } from './entities/legal-publication.entity';
import { LegalPublicationAsset } from './entities/legal-publication-asset.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import {
  LegalController,
  LegalPublicController,
} from './controllers/legal.controller';
import { LegalService } from './services/legal.service';
import { AccessService } from './services/access.service';
import { LegalOutboxWorker } from './workers/legal-outbox.worker';
import { StorageModule } from '../storage/storage.module';
import { LegalProductTenant } from './entities/legal-product-tenant.entity';
import { LegalRole } from './entities/legal-role.entity';
import { LegalRolePermission } from './entities/legal-role-permission.entity';
import { LegalTenantMembership } from './entities/legal-tenant-membership.entity';
import { LegalConsumedAccessEvent } from './entities/legal-consumed-access-event.entity';
import { LegalContextController } from './controllers/legal-context.controller';
import { LegalContextService } from './services/legal-context.service';
import { AccessEventsService } from './services/access-events.service';
import { BackchannelLogoutController } from './controllers/backchannel-logout.controller';
import { BackchannelLogoutService } from './services/backchannel-logout.service';
import { RedisModule } from '../auth/redis.module';
import { LegalEventBusClient } from './event-bus/legal-event-bus.client';
import { LegalEventBusConsumer } from './event-bus/legal-event-bus.consumer';
import { LegalEventOutboxPublisher } from './event-bus/legal-event-outbox.publisher';
import { LegalEventBusHealthController } from './controllers/legal-event-bus-health.controller';

@Module({
  imports: [
    StorageModule,
    RedisModule,
    TypeOrmModule.forFeature([
      LegalIssuer,
      LegalApplication,
      LegalDocument,
      LegalDocumentVersion,
      LegalAcceptanceRule,
      LegalAcceptance,
      LegalNotification,
      AuditEvent,
      OutboxEvent,
      LegalPublication,
      LegalPublicationAsset,
      LegalProductTenant,
      LegalRole,
      LegalRolePermission,
      LegalTenantMembership,
      LegalConsumedAccessEvent,
    ]),
  ],
  controllers: [
    LegalController,
    LegalPublicController,
    LegalContextController,
    BackchannelLogoutController,
    LegalEventBusHealthController,
  ],
  providers: [
    LegalService,
    AccessService,
    LegalOutboxWorker,
    LegalContextService,
    AccessEventsService,
    BackchannelLogoutService,
    LegalEventBusClient,
    LegalEventBusConsumer,
    LegalEventOutboxPublisher,
  ],
  exports: [LegalOutboxWorker],
})
export class LegalModule {}
