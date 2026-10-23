import { IsString, MaxLength } from 'class-validator';

export class SelectLegalContextDto {
  @IsString()
  @MaxLength(120)
  organizationId: string;
}
