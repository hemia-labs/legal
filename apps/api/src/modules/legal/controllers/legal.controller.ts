import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { LegalAuthGuard } from '../../../common/guards/legal-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import type { LegalRequest } from '../../../common/types/legal-request';
import {
  AcceptanceExportFilterDto,
  ApplicationFilterDto,
  AuditEventFilterDto,
  CreateAcceptanceDto,
  CreateApplicationDto,
  CreateDocumentDto,
  CreateIssuerDto,
  DocumentFilterDto,
  EvaluatePendingDto,
  IssuerFilterDto,
  MePendingQueryDto,
  NotificationFilterDto,
  PublishDraftDto,
  PublicDocumentQueryDto,
  SourceUploadMetadataDto,
  UpdateApplicationDto,
  UpdateApplicationStatusDto,
  UpdateDocumentDto,
  UpdateIssuerDto,
  UpdateIssuerStatusDto,
} from '../dtos/legal-catalog.dto';
import type { LegalSourceUpload } from '../types/legal-source.types';
import { LegalService } from '../services/legal.service';

@Controller('v1/legal')
@UseGuards(LegalAuthGuard, PermissionsGuard)
export class LegalController {
  constructor(private readonly service: LegalService) {}

  @Get('issuers')
  @Permissions('legal.issuers.view')
  listIssuers(@Query() filter: IssuerFilterDto) {
    return this.service.listIssuers(filter);
  }

  @Get('issuers/options')
  @Permissions('legal.issuers.view')
  listIssuerOptions() {
    return this.service.listIssuerOptions();
  }

  @Get('issuers/:id')
  @Permissions('legal.issuers.view')
  getIssuer(@Param('id') id: string) {
    return this.service.getIssuer(id);
  }

  @Post('issuers')
  @Permissions('legal.issuers.create')
  createIssuer(@Body() dto: CreateIssuerDto, @Req() request: LegalRequest) {
    return this.service.createIssuer(dto, request.actor);
  }

  @Patch('issuers/:id')
  @Permissions('legal.issuers.edit')
  updateIssuer(
    @Param('id') id: string,
    @Body() dto: UpdateIssuerDto,
    @Req() request: LegalRequest,
  ) {
    return this.service.updateIssuer(id, dto, request.actor);
  }

  @Patch('issuers/:id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('legal.issuers.edit')
  updateIssuerStatus(
    @Param('id') id: string,
    @Body() dto: UpdateIssuerStatusDto,
    @Req() request: LegalRequest,
  ) {
    return this.service.updateIssuerStatus(id, dto.status, request.actor);
  }

  @Post('issuers/:id/unarchive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('legal.issuers.archive')
  unarchiveIssuer(@Param('id') id: string, @Req() request: LegalRequest) {
    return this.service.unarchiveIssuer(id, request.actor);
  }

  @Post('issuers/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('legal.issuers.archive')
  archiveIssuer(@Param('id') id: string, @Req() request: LegalRequest) {
    return this.service.archiveIssuer(id, request.actor);
  }

  @Delete('issuers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('legal.issuers.delete')
  deleteIssuer(@Param('id') id: string, @Req() request: LegalRequest) {
    return this.service.deleteIssuer(id, request.actor);
  }

  @Get('applications')
  @Permissions('legal.applications.view')
  listApplications(@Query() filter: ApplicationFilterDto) {
    return this.service.listApplications(filter);
  }

  @Post('applications')
  @Permissions('legal.applications.create')
  createApplication(
    @Body() dto: CreateApplicationDto,
    @Req() request: LegalRequest,
  ) {
    return this.service.createApplication(dto, request.actor);
  }

  @Patch('applications/:id')
  @Permissions('legal.applications.edit')
  updateApplication(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
    @Req() request: LegalRequest,
  ) {
    return this.service.updateApplication(id, dto, request.actor);
  }

  @Patch('applications/:id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('legal.applications.edit')
  updateApplicationStatus(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @Req() request: LegalRequest,
  ) {
    return this.service.updateApplicationStatus(id, dto.status, request.actor);
  }

  @Post('applications/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('legal.applications.archive')
  archiveApplication(@Param('id') id: string, @Req() request: LegalRequest) {
    return this.service.archiveApplication(id, request.actor);
  }

  @Post('applications/:id/unarchive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('legal.applications.archive')
  unarchiveApplication(@Param('id') id: string, @Req() request: LegalRequest) {
    return this.service.unarchiveApplication(id, request.actor);
  }

  @Delete('applications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('legal.applications.delete')
  deleteApplication(@Param('id') id: string, @Req() request: LegalRequest) {
    return this.service.deleteApplication(id, request.actor);
  }

  @Get('documents')
  @Permissions('legal.documents.view')
  listDocuments(@Query() filter: DocumentFilterDto) {
    return this.service.listDocuments(filter);
  }

  @Get('document-types')
  @Permissions('legal.documents.view')
  listDocumentTypes() {
    return this.service.listDocumentTypes();
  }

  @Post('documents')
  @Permissions('legal.documents.create')
  createDocument(@Body() dto: CreateDocumentDto, @Req() request: LegalRequest) {
    return this.service.createDocument(dto, request.actor);
  }

  @Patch('documents/:id')
  @Permissions('legal.documents.edit')
  updateDocument(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @Req() request: LegalRequest,
  ) {
    return this.service.updateDocument(id, dto, request.actor);
  }

  @Post('documents/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('legal.documents.archive')
  archiveDocument(@Param('id') id: string, @Req() request: LegalRequest) {
    return this.service.archiveDocument(id, request.actor);
  }

  @Delete('documents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('legal.documents.delete')
  deleteDocument(@Param('id') id: string, @Req() request: LegalRequest) {
    return this.service.deleteDocument(id, request.actor);
  }

  @Get('documents/:documentId/draft')
  @Permissions('legal.versions.view')
  getDraft(@Param('documentId') documentId: string) {
    return this.service.getDraft(documentId);
  }

  @Get('documents/:documentId/versions')
  @Permissions('legal.versions.view')
  listVersions(@Param('documentId') documentId: string) {
    return this.service.listVersions(documentId);
  }

  @Get('documents/:documentId/publications/:publicationId')
  @Permissions('legal.versions.view')
  getPublication(
    @Param('documentId') documentId: string,
    @Param('publicationId') publicationId: string,
  ) {
    return this.service.getPublication(documentId, publicationId);
  }

  @Post('documents/:documentId/publications/:publicationId/retry')
  @Permissions('legal.versions.publish')
  retryPublication(
    @Param('documentId') documentId: string,
    @Param('publicationId') publicationId: string,
    @Req() request: LegalRequest,
  ) {
    return this.service.retryPublication(documentId, publicationId, request.actor);
  }

  @Post('documents/:documentId/draft')
  @Permissions('legal.versions.create')
  @UseInterceptors(FileInterceptor('file'))
  async createDraft(
    @Param('documentId') documentId: string,
    @Body('metadata') metadata: string | undefined,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })],
      }),
    )
    file: LegalSourceUpload,
    @Req() request: LegalRequest,
  ) {
    const sourceMetadata = await parseSourceUploadMetadata(metadata);
    return this.service.createDraft(
      documentId,
      { ...file, sourceKind: sourceMetadata.sourceKind },
      request.actor,
    );
  }

  @Patch('documents/:documentId/draft')
  @Permissions('legal.versions.edit')
  @UseInterceptors(FileInterceptor('file'))
  async updateDraft(
    @Param('documentId') documentId: string,
    @Body('metadata') metadata: string | undefined,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })],
      }),
    )
    file: LegalSourceUpload,
    @Req() request: LegalRequest,
  ) {
    const sourceMetadata = await parseSourceUploadMetadata(metadata);
    return this.service.updateDraft(
      documentId,
      { ...file, sourceKind: sourceMetadata.sourceKind },
      request.actor,
    );
  }

  @Post('documents/:documentId/draft/preview-publication')
  @Permissions('legal.versions.view')
  previewPublication(
    @Param('documentId') documentId: string,
    @Body() dto: PublishDraftDto,
    @Req() request: LegalRequest,
  ) {
    return this.service.previewPublication(documentId, scopePublication(dto, request));
  }

  @Post('documents/:documentId/draft/publish')
  @Permissions('legal.versions.publish')
  publishDraft(
    @Param('documentId') documentId: string,
    @Body() dto: PublishDraftDto,
    @Req() request: LegalRequest,
  ) {
    return this.service.publishDraft(
      documentId,
      scopePublication(dto, request),
      request.actor,
    );
  }

  @Get('me/pending')
  @Permissions('legal.pending.view')
  getMyPending(
    @Query() query: MePendingQueryDto,
    @Req() request: LegalRequest,
  ) {
    return this.service.getMyPending(query, request);
  }

  @Get('me/guard-check')
  @Permissions('legal.pending.view')
  guardCheck(@Query() query: MePendingQueryDto, @Req() request: LegalRequest) {
    return this.service.guardCheck(query, request);
  }

  @Post('pending/evaluate')
  @Permissions('legal.pending.evaluate')
  evaluatePending(
    @Body() dto: EvaluatePendingDto,
    @Req() request: LegalRequest,
  ) {
    if (request.actor.actorType !== 'service') {
      throw new ForbiddenException('Service actor required');
    }
    return this.service.evaluatePending(dto);
  }

  @Post('acceptances')
  @Permissions('legal.acceptances.create')
  createAcceptance(
    @Body() dto: CreateAcceptanceDto,
    @Req() request: LegalRequest,
  ) {
    return this.service.createAcceptance(dto, request);
  }

  @Get('acceptances/export')
  @Permissions('legal.acceptances.export')
  async exportAcceptances(
    @Query() filter: AcceptanceExportFilterDto,
    @Req() request: LegalRequest,
    @Res({ passthrough: true })
    response: { setHeader: (name: string, value: string) => void },
  ) {
    const exported = await this.service.exportAcceptances(
      filter,
      request.actor,
    );
    response.setHeader('content-type', exported.contentType);
    response.setHeader(
      'content-disposition',
      `attachment; filename="${exported.filename}"`,
    );
    return exported.body;
  }

  @Get('me/acceptances')
  @Permissions('legal.acceptances.view')
  listMyAcceptances(@Req() request: LegalRequest) {
    return this.service.listMyAcceptances(request);
  }

  @Get('acceptances/:id')
  @Permissions('legal.acceptances.view')
  getAcceptance(@Param('id') id: string, @Req() request: LegalRequest) {
    return this.service.getAcceptance(id, request.actor);
  }

  @Get('notifications')
  @Permissions('legal.notifications.view')
  listNotifications(@Query() filter: NotificationFilterDto) {
    return this.service.listNotifications(filter);
  }

  @Post('notifications/:notificationId/retry')
  @Permissions('legal.notifications.manage')
  retryNotification(
    @Param('notificationId') notificationId: string,
    @Req() request: LegalRequest,
  ) {
    return this.service.retryNotification(notificationId, request.actor);
  }

  @Post('notifications/:notificationId/cancel')
  @Permissions('legal.notifications.manage')
  cancelNotification(
    @Param('notificationId') notificationId: string,
    @Req() request: LegalRequest,
  ) {
    return this.service.cancelNotification(notificationId, request.actor);
  }

  @Get('audit-events')
  @Permissions('legal.audit.view')
  listAuditEvents(@Query() filter: AuditEventFilterDto) {
    return this.service.listAuditEvents(filter);
  }
}

function scopePublication(dto: PublishDraftDto, request: LegalRequest): PublishDraftDto {
  const context = request.legalContext;
  if (!context) throw new ForbiddenException('Legal organization context required');
  return {
    ...dto,
    rules: (dto.rules ?? []).map((rule) => ({
      ...rule,
      organizationId: context.organizationId,
      productTenantId: context.productTenantId,
    })),
  };
}

@Controller('v1/legal/public')
export class LegalPublicController {
  constructor(private readonly service: LegalService) {}

  @Get(':applicationId/documents/:documentKey')
  getCurrentPublicDocument(
    @Param('applicationId') applicationId: string,
    @Param('documentKey') documentKey: string,
    @Query() query: PublicDocumentQueryDto,
  ) {
    return this.service.getPublicDocument(
      applicationId,
      documentKey,
      query.locale,
    );
  }

  @Get(':applicationId/documents/:documentKey/versions/:version')
  getPublicDocumentVersion(
    @Param('applicationId') applicationId: string,
    @Param('documentKey') documentKey: string,
    @Param('version') version: string,
    @Query() query: PublicDocumentQueryDto,
  ) {
    return this.service.getPublicDocument(
      applicationId,
      documentKey,
      query.locale,
      version,
    );
  }
}

async function parseSourceUploadMetadata(metadata?: string) {
  if (!metadata) return new SourceUploadMetadataDto();

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    throw new BadRequestException('Upload metadata must be valid JSON');
  }

  const dto = plainToInstance(SourceUploadMetadataDto, parsed);
  const errors = await validate(dto, { whitelist: true });
  if (errors.length) throw new BadRequestException('Invalid upload metadata');
  return dto;
}
