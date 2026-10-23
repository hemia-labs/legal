import {
  IsArray,
  IsBoolean,
  IsObject,
  IsString,
  Length,
  Matches,
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SystemServiceDto {
  @Matches(/^[a-z][a-z0-9_-]{1,79}$/) code: string;
  @IsString() @Length(1, 200) name: string;
  @IsString() @Length(1, 2048) url: string;
  @IsBoolean() enabled: boolean;
  @IsString() @Matches(/^\S{1,160}$/) audience: string;
  @IsString() @Length(1, 2048) resource: string;
}
export class SystemClientDto {
  @IsString() @Length(1, 120) oauthIssuer: string;
  @IsString() @Length(1, 160) clientId: string;
  @Matches(/^[a-z][a-zA-Z0-9_]{1,79}$/) capabilityCode: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ArrayUnique()
  @Matches(/^[a-z][a-z0-9_-]{1,79}$/, { each: true })
  roles: string[];
  @IsBoolean() enabled: boolean;
}
export class SaveSystemDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SystemServiceDto)
  services: SystemServiceDto[];
  @Matches(/^[a-z][a-z0-9_-]{1,79}$/) code: string;
  @IsString() @Length(1, 200) name: string;
  @IsBoolean() enabled: boolean;
  @IsObject() configuration: Record<string, unknown>;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SystemClientDto)
  clients: SystemClientDto[];
}
export class SaveCapabilityDto {
  @Matches(/^[a-z][a-zA-Z0-9_]{1,79}$/) code: string;
  @IsString() @Length(1, 200) name: string;
  @IsObject() schema: Record<string, unknown>;
  @IsArray() @ArrayMaxSize(30) functions: unknown[];
}

export class ServiceDestinationDto {
  @IsString() @Length(1, 2048) url: string;
}
