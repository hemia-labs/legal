import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LegalApplication } from './legal-application.entity';
import { LegalIssuer } from './legal-issuer.entity';

@Entity('documents')
@Index(
  'IDX_legal_documents_context_key_locale_unique',
  ['issuerId', 'applicationId', 'key', 'locale'],
  { unique: true, where: '"deleted_at" IS NULL' },
)
export class LegalDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'issuer_id', type: 'uuid' })
  issuerId: string;

  @ManyToOne(() => LegalIssuer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issuer_id' })
  issuer: LegalIssuer;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => LegalApplication, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'application_id' })
  application: LegalApplication;

  @Column({ length: 80 })
  key: string;

  @Column({ name: 'document_type', length: 40, default: 'terms_and_conditions' })
  documentType: string;

  @Column({ name: 'document_variant', length: 20, default: 'standard' })
  documentVariant: 'standard' | 'integral' | 'simplified' | 'short';

  @Column({ name: 'parent_document_id', type: 'uuid', nullable: true })
  parentDocumentId: string | null;

  @ManyToOne(() => LegalDocument, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'parent_document_id' })
  parentDocument: LegalDocument | null;

  @Column({ length: 12 })
  locale: string;

  @Column({ length: 200 })
  title: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
