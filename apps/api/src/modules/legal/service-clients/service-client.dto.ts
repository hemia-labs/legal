import { Type, plainToInstance } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsBoolean,
  IsIn,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';
export class ServiceGrantDto {
  @IsIn(['legal.pending.evaluate', 'legal.acceptances.validate'])
  operation: string;
  @IsUUID() issuerId: string;
  @IsUUID() applicationId: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  organizationIds: string[] = [];
}
export class ServicePolicyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ServiceGrantDto)
  grants: ServiceGrantDto[];
}
export class SaveServiceClientDto {
  @IsString() @Length(1, 2048) oauthIssuer: string;
  @Matches(/^[^\s]+$/) @Length(1, 120) clientId: string;
  @IsBoolean() enabled: boolean;
  @IsDefined()
  @ValidateNested()
  @Type(() => ServicePolicyDto)
  policy: ServicePolicyDto;
}
export function parseServicePolicy(value: unknown): ServicePolicyDto {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid service client policy');
  const policy = plainToInstance(ServicePolicyDto, value);
  if (
    validateSync(policy, { whitelist: true, forbidNonWhitelisted: true })
      .length ||
    !policy.grants?.length
  )
    throw new BadRequestException('Invalid service client policy');
  return policy;
}
