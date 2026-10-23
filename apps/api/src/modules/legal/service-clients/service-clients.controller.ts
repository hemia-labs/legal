import {
  Body,
  Controller,
  Get,
  Header,
  Put,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { LegalAuthGuard } from '../../../common/guards/legal-auth.guard';
import type { LegalRequest } from '../../../common/types/legal-request';
import { SaveServiceClientDto } from './service-client.dto';
import { ServiceClientsService } from './service-clients.service';
@Controller('v1/legal/service-clients')
@UseGuards(LegalAuthGuard)
export class ServiceClientsController {
  constructor(private readonly service: ServiceClientsService) {}
  @Get()
  @Permissions('legal.integrations.view')
  @Header('Cache-Control', 'no-store')
  list(@Req() req: LegalRequest) {
    return this.service.list(req);
  }
  @Put()
  @Permissions('legal.integrations.create', 'legal.integrations.edit')
  @Header('Cache-Control', 'no-store')
  save(
    @Req() req: LegalRequest,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: SaveServiceClientDto,
  ) {
    return this.service.save(req, dto);
  }
}
