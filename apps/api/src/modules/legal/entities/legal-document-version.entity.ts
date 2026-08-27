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
import { LegalDocument } from './legal-document.entity';

@Entity('document_versions')
@Index(
  'IDX_legal_versions_document_version_unique',
  ['documentId', 'version'],
  { unique: true },
)
export class LegalDocumentVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @ManyToOne(() => LegalDocument, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_id' })
  document: LegalDocument;

  @Column({ length: 40 })
  version: string;

  @Column({ length: 20, default: 'draft' })
  status: string;

  @Column({ name: 'content_hash', type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  @Column({ name: 'source_kind', type: 'varchar', length: 20, nullable: true })
  sourceKind: 'pdf' | 'html' | 'markdown' | null;

  @Column({ name: 'source_content_type', type: 'varchar', length: 120, nullable: true })
  sourceContentType: string | null;

  @Column({ name: 'source_file_name', type: 'varchar', length: 255, nullable: true })
  sourceFileName: string | null;

  @Column({ name: 'source_size_bytes', type: 'bigint', nullable: true })
  sourceSizeBytes: number | null;

  @Column({ name: 'source_hash', type: 'varchar', length: 64, nullable: true })
  sourceHash: string | null;

  @Column({ name: 'source_s3_bucket', type: 'varchar', length: 255, nullable: true })
  sourceS3Bucket: string | null;

  @Column({ name: 'source_s3_object_key', type: 'varchar', length: 1024, nullable: true })
  sourceS3ObjectKey: string | null;

  @Column({ name: 'source_s3_version_id', type: 'varchar', length: 255, nullable: true })
  sourceS3VersionId: string | null;

  @Column({ name: 'source_s3_etag', type: 'varchar', length: 255, nullable: true })
  sourceS3Etag: string | null;

  @Column({ name: 'effective_from', type: 'timestamptz', nullable: true })
  effectiveFrom: Date | null;

  @Column({ name: 'effective_until', type: 'timestamptz', nullable: true })
  effectiveUntil: Date | null;

  @Column({ name: 'acceptance_deadline', type: 'timestamptz', nullable: true })
  acceptanceDeadline: Date | null;

  @Column({ name: 'grace_period_days', default: 0 })
  gracePeriodDays: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
