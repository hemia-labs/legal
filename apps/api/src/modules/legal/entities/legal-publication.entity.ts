import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LegalDocumentVersion } from './legal-document-version.entity';

@Entity('publications')
@Index('IDX_legal_publications_document_status', ['documentId', 'status'])
@Index('IDX_legal_publications_version_unique', ['documentId', 'version'], {
  unique: true,
})
export class LegalPublication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'document_version_id', type: 'uuid' })
  documentVersionId: string;

  @ManyToOne(() => LegalDocumentVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_version_id' })
  documentVersion: LegalDocumentVersion;

  @Column({ name: 'issuer_id', type: 'uuid' })
  issuerId: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @Column({ name: 'document_type', length: 40 })
  documentType: string;

  @Column({ name: 'product_id', length: 120 })
  productId: string;

  @Column({
    name: 'organization_id',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  organizationId: string | null;

  @Column({
    name: 'product_tenant_id',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  productTenantId: string | null;

  @Column({ length: 80 })
  documentKey: string;

  @Column({ length: 40 })
  version: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom: Date;

  @Column({ name: 'effective_until', type: 'timestamptz', nullable: true })
  effectiveUntil: Date | null;

  @Column({ name: 'acceptance_deadline', type: 'timestamptz', nullable: true })
  acceptanceDeadline: Date | null;

  @Column({ name: 'grace_period_days', default: 0 })
  gracePeriodDays: number;

  @Column({ name: 'rules_snapshot', type: 'jsonb' })
  rulesSnapshot: Record<string, unknown>[];

  @Column({ name: 'content_hash', length: 64 })
  contentHash: string;

  @Column({ name: 'source_kind', type: 'varchar', length: 20, nullable: true })
  sourceKind?: 'pdf' | 'html' | 'markdown' | null;

  @Column({ name: 'source_hash', type: 'varchar', length: 64, nullable: true })
  sourceHash?: string | null;

  @Column({ name: 'requested_by_identity_issuer', length: 120 })
  requestedByIdentityIssuer: string;

  @Column({ name: 'requested_by_subject_id', length: 160 })
  requestedBySubjectId: string;

  @Column({
    name: 'published_by_identity_issuer',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  publishedByIdentityIssuer: string | null;

  @Column({
    name: 'published_by_subject_id',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  publishedBySubjectId: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
