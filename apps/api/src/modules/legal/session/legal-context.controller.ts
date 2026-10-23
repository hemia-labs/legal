import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { SsoAuthGuard } from '@hemia/auth/nestjs';
import type { LegalRequest } from '../../../common/types/legal-request';
import { SelectLegalContextDto } from './legal-context.dto';
import { LegalContextService } from './legal-context.service';

@Controller('v1/legal')
@UseGuards(SsoAuthGuard)
export class LegalContextController {
  constructor(private readonly context: LegalContextService) {}

  @Get('session')
  session(@Req() request: LegalRequest) {
    return this.context.session(request);
  }

  @Post('context')
  select(@Body() dto: SelectLegalContextDto, @Req() request: LegalRequest) {
    return this.context.select(request, dto.organizationId);
  }
}
