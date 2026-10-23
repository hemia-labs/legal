import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
export class SaveIntegrationDto {
  @IsUUID() systemId: string;
  @IsUUID() applicationId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  documentIds: string[];
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  enabled?: boolean;
}
export class PrepareExternalAcceptanceDto {
  @IsUUID() subjectId: string;
  @IsUUID() organizationId: string;
  @IsUUID() sessionId: string;
  @IsUUID() idempotencyKey: string;
}
export class DocumentConfirmationDto {
  @IsUUID() documentVersionId: string;
  @Matches(/^[a-f0-9]{64}$/) contentHash: string;
  @Equals(true) accepted: true;
}
export class AcceptExternalDocumentsDto {
  @IsUUID() subjectId: string;
  @IsUUID() organizationId: string;
  @IsUUID() sessionId: string;
  @IsUUID() requestId: string;
  @IsUUID() idempotencyKey: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((v: DocumentConfirmationDto) => v.documentVersionId)
  @ValidateNested({ each: true })
  @Type(() => DocumentConfirmationDto)
  confirmations: DocumentConfirmationDto[];
}
export class ValidateExternalEvidenceDto {
  @IsUUID() organizationId: string;
  @IsUUID() subjectId: string;
  @IsUUID() legalAcceptanceId: string;
  @IsString() @Length(1, 80) productCode: string;
}
