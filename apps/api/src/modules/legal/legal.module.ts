import {
  SystemCatalogController,
  SystemOptionsController,
} from './systems/systems.controller';
import { SystemsService } from './systems/systems.service';
import { SystemCatalogGuard } from './systems/system-catalog.guard';
import { ServiceClientsController } from './service-clients/service-clients.controller';
import { ServiceClientsService } from './service-clients/service-clients.service';
import { LegalServiceClient } from './entities/legal-service-client.entity';
import { ServiceTokenService } from '../auth/service-token.service';
import { IntegrationClientsService } from './integrations/registry/integration-clients.service';
import {
  IntegrationRegistryController,
  ExternalAcceptanceController,
} from './integrations/integration.controller';
import { IntegrationRegistryService } from './integrations/registry/integration-registry.service';
import { ExternalContextService } from './integrations/acceptance/external-context.service';
import { ExternalAcceptanceService } from './integrations/acceptance/external-acceptance.service';
import { IntegrationAuthGuard } from './integrations/acceptance/integration-auth.guard';
import { LegalAcceptanceValidationService } from './authorization/legal-acceptance-validation.service';
import { LegalPersonalGuard } from './authorization/legal-personal.guard';
import { LegalServiceGuard } from './authorization/legal-service.guard';
import { LegalConsumerAccessService } from './authorization/legal-consumer-access.service';
import { TargetValidationController } from './target-validation/target-validation.controller';
import { TargetValidationGuard } from './target-validation/target-validation.guard';
import { TargetValidationService } from './target-validation/target-validation.service';
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
  LegalPersonalController,
  LegalTechnicalController,
  LegalPublicController,
} from './controllers/legal.controller';
import { LegalService } from './services/legal.service';
import { AccessService } from './event-bus/access.service';
import { LegalOutboxWorker } from './workers/legal-outbox.worker';
import { StorageModule } from '../storage/storage.module';
import { LegalProductTenant } from './entities/legal-product-tenant.entity';
import { LegalConsumedAccessEvent } from './entities/legal-consumed-access-event.entity';
import { LegalContextController } from './session/legal-context.controller';
import { LegalContextService } from './session/legal-context.service';
import { AccessEventsService } from './event-bus/access-events.service';
import { BackchannelLogoutController } from './session/backchannel-logout.controller';
import { BackchannelLogoutService } from './session/backchannel-logout.service';
import { RedisModule } from '../auth/redis/redis.module';
import { LegalEventBusClient } from './event-bus/legal-event-bus.client';
import { LegalEventBusConsumer } from './event-bus/legal-event-bus.consumer';
import { LegalEventOutboxPublisher } from './event-bus/legal-event-outbox.publisher';
import { IntegrationCapabilitiesController } from './integrations/integration-capabilities.controller';
import { LegalEventBusHealthController } from './event-bus/legal-event-bus-health.controller';

@Module({
  imports: [
    StorageModule,
    RedisModule,
    TypeOrmModule.forFeature([
      LegalServiceClient,
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
      LegalConsumedAccessEvent,
    ]),
  ],
  controllers: [
    SystemCatalogController,
    SystemOptionsController,
    ServiceClientsController,
    IntegrationRegistryController,
    IntegrationCapabilitiesController,
    ExternalAcceptanceController,
    TargetValidationController,
    LegalController,
    LegalPersonalController,
    LegalTechnicalController,
    LegalPublicController,
    LegalContextController,
    BackchannelLogoutController,
    LegalEventBusHealthController,
  ],
  providers: [
    SystemsService,
    SystemCatalogGuard,
    ServiceClientsService,
    ServiceTokenService,
    IntegrationClientsService,
    IntegrationRegistryService,
    ExternalContextService,
    ExternalAcceptanceService,
    IntegrationAuthGuard,
    LegalAcceptanceValidationService,
    LegalPersonalGuard,
    LegalServiceGuard,
    LegalConsumerAccessService,
    TargetValidationGuard,
    TargetValidationService,
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
