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
import { LegalDocumentVersion } from './legal-document-version.entity';

@Entity('acceptance_rules')
@Index('IDX_legal_rules_version', ['versionId'])
@Index('IDX_legal_rules_document_context', [
  'documentId',
  'applicationId',
  'organizationId',
  'productTenantId',
  'role',
  'acceptanceMode',
])
export class LegalAcceptanceRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @ManyToOne(() => LegalDocument, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_id' })
  document: LegalDocument;

  @Column({ name: 'version_id', type: 'uuid' })
  versionId: string;

  @ManyToOne(() => LegalDocumentVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'version_id' })
  version: LegalDocumentVersion;

  @Column({ name: 'issuer_id', type: 'uuid' })
  issuerId: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

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

  @Column({ type: 'varchar', length: 120, nullable: true })
  role: string | null;

  @Column({ name: 'acceptance_mode', length: 40 })
  acceptanceMode: string;

  @Column({ name: 'is_blocking', default: true })
  isBlocking: boolean;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
