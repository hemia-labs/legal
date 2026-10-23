import { IntegrationClientsService } from './registry/integration-clients.service';
import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
  ValidationPipe,
  Header,
} from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { LegalAuthGuard } from '../../../common/guards/legal-auth.guard';
import type { LegalRequest } from '../../../common/types/legal-request';
import {
  IntegrationAuthGuard,
  type IntegrationRequest,
} from './acceptance/integration-auth.guard';
import { IntegrationRegistryService } from './registry/integration-registry.service';
import { ExternalAcceptanceService } from './acceptance/external-acceptance.service';
import {
  SaveIntegrationDto,
  PrepareExternalAcceptanceDto,
  AcceptExternalDocumentsDto,
  ValidateExternalEvidenceDto,
} from './integration.dto';
const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
@Controller('v1/legal/integrations')
@UseGuards(IntegrationAuthGuard)
export class ExternalAcceptanceController {
  constructor(private readonly service: ExternalAcceptanceService) {}
  @Post('acceptance-requests')
  @Permissions('legal.integration.acceptances.prepare')
  @Header('Cache-Control', 'no-store')
  prepare(
    @Req() req: IntegrationRequest,
    @Body(validation) dto: PrepareExternalAcceptanceDto,
  ) {
    return this.service.prepare(req.integrationCaller, dto);
  }
  @Post('acceptances')
  @Permissions('legal.integration.acceptances.create')
  @Header('Cache-Control', 'no-store')
  accept(
    @Req() req: IntegrationRequest,
    @Body(validation) dto: AcceptExternalDocumentsDto,
  ) {
    return this.service.accept(req.integrationCaller, dto);
  }
  @Post('acceptances/validate')
  @Permissions('legal.integration.acceptances.validate')
  @Header('Cache-Control', 'no-store')
  validate(
    @Req() req: IntegrationRequest,
    @Body(validation) dto: ValidateExternalEvidenceDto,
  ) {
    return this.service.validate(req.integrationCaller, dto);
  }
}
@Controller('v1/legal/integration-sources')
@UseGuards(LegalAuthGuard)
export class IntegrationRegistryController {
  constructor(
    private readonly registry: IntegrationRegistryService,
    private readonly clients: IntegrationClientsService,
  ) {}
  @Get('clients')
  @Permissions('legal.integrations.create', 'legal.integrations.edit')
  @Header('Cache-Control', 'no-store')
  listClients(@Req() req: LegalRequest) {
    return this.clients.list(req);
  }
  @Get()
  @Permissions('legal.integrations.view')
  list(@Req() req: LegalRequest) {
    return this.registry.list(req);
  }
  @Post()
  @Permissions('legal.integrations.create')
  create(@Req() req: LegalRequest, @Body(validation) dto: SaveIntegrationDto) {
    return this.registry.save(req, dto);
  }
  @Put(':id')
  @Permissions('legal.integrations.edit')
  update(
    @Req() req: LegalRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validation) dto: SaveIntegrationDto,
  ) {
    return this.registry.save(req, dto, id);
  }
  @Post(':id/disable')
  @Permissions('legal.integrations.disable')
  disable(@Req() req: LegalRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.registry.disable(req, id);
  }
}
