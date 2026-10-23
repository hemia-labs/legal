import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ValidateTargetsDto } from './target-validation.controller';

type Row = {
  id: string;
  status: string;
  issuer_id: string | null;
  parent_active: boolean;
};
@Injectable()
export class TargetValidationService {
  constructor(private readonly database: DataSource) {}
  async validate(input: ValidateTargetsDto) {
    const rows: Row[] = await this.database.query(
      input.target_type === 'legal_issuer'
        ? `SELECT id, status, NULL::uuid AS issuer_id, true AS parent_active FROM issuers WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`
        : `SELECT a.id, a.status, a.issuer_id, (i.id IS NOT NULL AND i.status = 'active' AND i.deleted_at IS NULL) AS parent_active
         FROM applications a LEFT JOIN issuers i ON i.id = a.issuer_id WHERE a.id = ANY($1::uuid[]) AND a.deleted_at IS NULL`,
      [input.ids],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const results = input.ids.map((id) => {
      const row = byId.get(id);
      const reason = !row
        ? 'not_found'
        : row.status !== 'active'
          ? 'inactive'
          : !row.parent_active
            ? 'parent_unavailable'
            : null;
      return {
        id,
        target_type: input.target_type,
        valid: reason === null,
        status: row?.status ?? null,
        issuer_id: row?.issuer_id ?? null,
        reason,
      };
    });
    return { valid: results.every((result) => result.valid), results };
  }
}
