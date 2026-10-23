import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
  ParseUUIDPipe,
  Header,
} from '@nestjs/common';
import type { LegalRequest } from '../../../common/types/legal-request';
import { LegalAuthGuard } from '../../../common/guards/legal-auth.guard';
import { SystemCatalogGuard } from './system-catalog.guard';
import { SystemsService } from './systems.service';
import { IntegrationRegistryService } from '../integrations/registry/integration-registry.service';
import { SaveIntegrationDto } from '../integrations/integration.dto';
import {
  SaveSystemDto,
  SaveCapabilityDto,
  ServiceDestinationDto,
} from './systems.dto';
const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
@Controller('v1/legal/system-catalog')
@UseGuards(SystemCatalogGuard)
export class SystemCatalogController {
  constructor(
    private readonly systems: SystemsService,
    private readonly registry: IntegrationRegistryService,
  ) {}
  @Get('systems') @Header('Cache-Control', 'no-store') list() {
    return this.systems.list();
  }
  @Post('systems/validate') validate(
    @Body(validation) dto: SaveSystemDto,
    @Req() req: LegalRequest,
    @Query('id', new ParseUUIDPipe({ optional: true })) id?: string,
  ) {
    return this.systems.save(dto, req.actor, id, true);
  }
  @Post('systems') create(
    @Body(validation) dto: SaveSystemDto,
    @Req() req: LegalRequest,
  ) {
    return this.systems.save(dto, req.actor);
  }
  @Put('systems/:id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validation) dto: SaveSystemDto,
    @Req() req: LegalRequest,
  ) {
    return this.systems.save(dto, req.actor, id);
  }
  @Get('capabilities') @Header('Cache-Control', 'no-store') capabilities() {
    return this.systems.capabilities();
  }
  @Post('capabilities') saveCapability(
    @Body(validation) dto: SaveCapabilityDto,
    @Req() req: LegalRequest,
  ) {
    return this.systems.saveCapability(dto, req.actor);
  }
  @Post('service-destinations/validate') validateServiceDestination(
    @Body(validation) dto: ServiceDestinationDto,
  ) {
    return this.systems.serviceDestination(dto.url);
  }
  @Get('integration-options')
  @Header('Cache-Control', 'no-store')
  integrationOptions(@Req() req: LegalRequest) {
    return this.registry.catalogOptions(req);
  }
  @Put('integrations') saveIntegration(
    @Req() req: LegalRequest,
    @Body(validation) dto: SaveIntegrationDto,
  ) {
    return this.registry.saveFromCatalog(req, dto);
  }
  @Get('choices') @Header('Cache-Control', 'no-store') choices() {
    return this.systems.choices();
  }
}
@Controller('v1/legal/systems')
@UseGuards(LegalAuthGuard)
export class SystemOptionsController {
  constructor(private readonly systems: SystemsService) {}
  @Get('options') @Header('Cache-Control', 'no-store') options(
    @Req() req: LegalRequest,
  ) {
    return this.systems.options(req);
  }
}
