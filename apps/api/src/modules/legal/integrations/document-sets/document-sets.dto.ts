import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
export class SetDocumentDto {
  @IsUUID() documentId: string;
  @IsIn(['accept', 'acknowledge', 'consent']) requiredAction: string;
  @IsBoolean() blocking: boolean;
  @IsBoolean() requireReacceptance: boolean;
  @IsOptional() @IsISO8601() deadline?: string;
}
export class SaveDocumentSetDto {
  @IsUUID() sourceId: string;
  @IsString() @Length(1, 200) name: string;
  @IsBoolean() enabled: boolean;
  @IsIn(['collector_attested', 'verified_session']) verification: string;
  @IsBoolean() requiresOrganization: boolean;
  @IsBoolean() requiresMfa: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((d: SetDocumentDto) => d.documentId)
  @ValidateNested({ each: true })
  @Type(() => SetDocumentDto)
  documents: SetDocumentDto[];
  @IsISO8601() effectiveFrom: string;
  @IsOptional() @IsUUID() expectedRevision?: string;
}
export class EvidenceConfirmationDto {
  @IsUUID() documentVersionId: string;
  @Matches(/^[a-f0-9]{64}$/) contentHash: string;
  @IsIn(['accept', 'acknowledge', 'consent']) action: string;
  @Equals(true) confirmed: true;
}
export class RecordEvidenceDto {
  @IsUUID() snapshotToken: string;
  @IsUUID() idempotencyKey: string;
  @IsString() @Length(1, 160) subjectId: string;
  @IsOptional() @IsString() @Length(1, 120) organizationId?: string;
  @IsOptional() @IsString() @Length(1, 160) sessionId?: string;
  @IsISO8601() occurredAt: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((d: EvidenceConfirmationDto) => d.documentVersionId)
  @ValidateNested({ each: true })
  @Type(() => EvidenceConfirmationDto)
  confirmations: EvidenceConfirmationDto[];
}
export class EvaluateSetDto {
  @IsUUID() applicationId: string;
  @Matches(/^[a-z][a-z0-9_-]{1,79}$/) documentSetKey: string;
  @IsString() @Length(1, 160) subjectId: string;
  @IsOptional() @IsString() @Length(1, 120) organizationId?: string;
  @IsOptional() @IsString() @Length(1, 160) sessionId?: string;
  @Matches(/^[a-z]{2}-[A-Z]{2}$/) locale: string;
}
export class ValidateSetEvidenceDto extends EvaluateSetDto {
  @IsUUID() evidenceId: string;
}
export class DocumentSetLocaleDto {
  @Matches(/^[a-z]{2}-[A-Z]{2}$/) locale: string;
}
export class EvidenceHistoryDto extends EvaluateSetDto {
  @IsOptional() @IsUUID() cursor?: string;
}
