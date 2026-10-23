import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { TargetValidationGuard } from './target-validation.guard';
import { TargetValidationService } from './target-validation.service';

export class ValidateTargetsDto {
  @IsIn(['legal_issuer', 'legal_application'])
  target_type: 'legal_issuer' | 'legal_application';
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((id: unknown) =>
          typeof id === 'string' ? id.toLowerCase() : id,
        )
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids: string[];
}
@Controller('v1/internal/authorization/targets')
@UseGuards(TargetValidationGuard)
export class TargetValidationController {
  constructor(private readonly service: TargetValidationService) {}
  @Post('validate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  validate(@Body() body: ValidateTargetsDto) {
    return this.service.validate(body);
  }
}
