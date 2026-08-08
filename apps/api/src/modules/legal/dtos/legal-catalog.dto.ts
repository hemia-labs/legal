import {
  ArrayMinSize,
  IsBoolean,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsOptional,
  IsLocale,
  IsString,
  IsUppercase,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateIssuerDto {
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  @Matches(/^issuer_[a-z0-9]+(?:_[a-z0-9]+)*$/)
  key: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName: string;

  @Transform(trim)
  @IsIn(['hemia', 'customer', 'partner', 'white_label_brand', 'internal'])
  type: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  taxId?: string;

  @Transform(trim)
  @IsString()
  @IsUppercase()
  @IsISO31661Alpha2()
  countryCode: string;

  @Transform(trim)
  @IsString()
  @MaxLength(12)
  @IsLocale()
  defaultLocale: string;
}

export class UpdateIssuerDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @Transform(trim)
  @IsIn(['hemia', 'customer', 'partner', 'white_label_brand', 'internal'])
  type?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  taxId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsUppercase()
  @IsISO31661Alpha2()
  countryCode?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(12)
  @IsLocale()
  defaultLocale?: string;
}

export class IssuerFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsIn(['hemia', 'customer', 'partner', 'white_label_brand', 'internal'])
  type?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: string;

  @IsOptional()
  @IsUppercase()
  @IsISO31661Alpha2()
  countryCode?: string;
}

export class CreateApplicationDto {
  @IsUUID()
  issuerId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  key: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;
}

export class UpdateApplicationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;
}

export class ApplicationFilterDto {
  @IsOptional()
  @IsUUID()
  issuerId?: string;
}

export class CreateDocumentDto {
  @IsUUID()
  issuerId: string;

  @IsUUID()
  applicationId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  key: string;

  @IsString()
  @MinLength(2)
  @MaxLength(12)
  locale: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  documentType?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;
}

export class DocumentFilterDto {
  @IsOptional()
  @IsUUID()
  issuerId?: string;

  @IsOptional()
  @IsUUID()
  applicationId?: string;
}

export class NotificationFilterDto extends DocumentFilterDto {
  @IsOptional()
  @IsIn(['pending', 'sent', 'failed', 'cancelled'])
  status?: string;
}

export class AuditEventFilterDto extends ApplicationFilterDto {
  @IsOptional()
  @IsUUID()
  applicationId?: string;
}

export class AcceptanceExportFilterDto extends ApplicationFilterDto {
  @IsOptional()
  @IsUUID()
  applicationId?: string;

  @IsOptional()
  @IsIn(['csv', 'json'])
  format?: string;
}

export class UpsertDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  contentMarkdown: string;
}

export class AcceptanceRuleInputDto {
  @IsIn(['individual', 'organization_representative', 'informational'])
  acceptanceMode: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  organizationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  productTenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  isBlocking?: boolean;
}

export class PublishDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  version: string;

  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsDateString()
  acceptanceDeadline?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  gracePeriodDays?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AcceptanceRuleInputDto)
  rules: AcceptanceRuleInputDto[];
}

export class MePendingQueryDto {
  @IsUUID()
  issuerId: string;

  @IsUUID()
  applicationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  organizationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  productTenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  locale?: string;
}

export class EvaluatePendingDto extends MePendingQueryDto {
  @IsString()
  @MaxLength(120)
  identityIssuer: string;

  @IsString()
  @MaxLength(160)
  subjectId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

export class CreateAcceptanceDto {
  @IsUUID()
  documentVersionId: string;

  @IsUUID()
  acceptanceRuleId: string;

  @IsBoolean()
  accepted: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  organizationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  productTenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  locale?: string;
}
