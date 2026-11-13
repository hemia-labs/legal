import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { LegalAuthGuard } from '../../../../common/guards/legal-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import type { LegalRequest } from '../../../../common/types/legal-request';
import { IntegrationAuthGuard } from '../acceptance/integration-auth.guard';
import type { IntegrationRequest } from '../acceptance/integration-auth.guard';
import { DocumentSetsService } from './document-sets.service';
import {
  AccountCatalogDto,
  DocumentSetLocaleDto,
  EvaluateSetDto,
  EvidenceHistoryDto,
  RecordEvidenceDto,
  SaveDocumentSetDto,
  ValidateSetEvidenceDto,
} from './document-sets.dto';
const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
@Controller('v1/legal/public')
export class PublicDocumentSetsController {
  constructor(private readonly service: DocumentSetsService) {}
  @Get(':applicationId/document-sets/:key')
  @Header('Cache-Control', 'no-store')
  published(
    @Param('applicationId', ParseUUIDPipe) app: string,
    @Param('key') key: string,
    @Query(validation) query: DocumentSetLocaleDto,
  ) {
    return this.service.published(app, key, query.locale);
  }
}
@Controller('v1/legal/applications/:applicationId/document-sets')
@UseGuards(LegalAuthGuard, PermissionsGuard)
export class DocumentSetsController {
  constructor(private readonly service: DocumentSetsService) {}
  @Get()
  @Permissions('legal.documents.view')
  list(
    @Param('applicationId', ParseUUIDPipe) app: string,
    @Req() req: LegalRequest,
  ) {
    return this.service.list(app, req.actor);
  }
  @Put(':key')
  @Permissions('legal.documents.edit')
  save(
    @Param('applicationId', ParseUUIDPipe) app: string,
    @Param('key') key: string,
    @Body(validation) dto: SaveDocumentSetDto,
    @Req() req: LegalRequest,
  ) {
    return this.service.save(app, key, dto, req.actor);
  }
}
@Controller('v1/legal/integrations')
@UseGuards(IntegrationAuthGuard)
export class EvidenceController {
  constructor(private readonly service: DocumentSetsService) {}
  @Post('account-catalog')
  @Permissions('legal.integration.acceptances.prepare')
  @Header('Cache-Control', 'no-store')
  accountCatalog(
    @Body(validation) dto: AccountCatalogDto,
    @Req() req: IntegrationRequest,
  ) {
    return this.service.accountCatalog(req.integrationCaller, dto);
  }
  @Post('evidence')
  @Permissions('legal.integration.acceptances.create')
  @Header('Cache-Control', 'no-store')
  record(
    @Body(validation) dto: RecordEvidenceDto,
    @Req() req: IntegrationRequest,
  ) {
    return this.service.record(req.integrationCaller, dto);
  }
  @Post('pending/evaluate')
  @Permissions('legal.integration.acceptances.prepare')
  @Header('Cache-Control', 'no-store')
  pending(
    @Body(validation) dto: EvaluateSetDto,
    @Req() req: IntegrationRequest,
  ) {
    return this.service.pending(req.integrationCaller, dto);
  }
  @Post('pending/prepare')
  @Permissions('legal.integration.acceptances.prepare')
  @Header('Cache-Control', 'no-store')
  preparePending(
    @Body(validation) dto: EvaluateSetDto,
    @Req() req: IntegrationRequest,
  ) {
    return this.service.preparePending(req.integrationCaller, dto);
  }
  @Post('evidence/history')
  @Permissions('legal.integration.acceptances.prepare')
  @Header('Cache-Control', 'no-store')
  history(
    @Body(validation) dto: EvidenceHistoryDto,
    @Req() req: IntegrationRequest,
  ) {
    return this.service.history(req.integrationCaller, dto);
  }
  @Post('evidence/validate')
  @Permissions('legal.integration.acceptances.validate')
  @Header('Cache-Control', 'no-store')
  validate(
    @Body(validation) dto: ValidateSetEvidenceDto,
    @Req() req: IntegrationRequest,
  ) {
    return this.service.validate(req.integrationCaller, dto);
  }
}
