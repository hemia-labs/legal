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
import { LegalAcceptance } from './legal-acceptance.entity';

@Entity('evidence')
@Index('IDX_legal_evidence_acceptance_unique', ['acceptanceId'], { unique: true })
export class LegalEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'acceptance_id', type: 'uuid' })
  acceptanceId: string;

  @ManyToOne(() => LegalAcceptance, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'acceptance_id' })
  acceptance: LegalAcceptance;

  @Column({ name: 'document_version_id', type: 'uuid' })
  documentVersionId: string;

  @Column({ name: 'status', length: 20, default: 'pending' })
  status: string;

  @Column({ name: 's3_bucket', type: 'varchar', length: 255, nullable: true })
  s3Bucket: string | null;

  @Column({ name: 's3_object_key', type: 'varchar', length: 1024, nullable: true })
  s3ObjectKey: string | null;

  @Column({ name: 's3_version_id', type: 'varchar', length: 255, nullable: true })
  s3VersionId: string | null;

  @Column({ name: 'content_type', length: 120, default: 'application/json' })
  contentType: string;

  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes: number | null;

  @Column({ name: 'sha256', type: 'varchar', length: 64, nullable: true })
  sha256: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
