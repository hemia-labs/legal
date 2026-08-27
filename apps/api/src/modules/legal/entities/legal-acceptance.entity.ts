import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LegalDocument } from './legal-document.entity';
import { LegalDocumentVersion } from './legal-document-version.entity';
import { LegalAcceptanceRule } from './legal-acceptance-rule.entity';

@Entity('acceptances')
@Index('IDX_legal_acceptances_actor', [
  'identityIssuer',
  'subjectId',
  'createdAt',
])
@Index('IDX_legal_acceptances_context', [
  'issuerId',
  'applicationId',
  'organizationId',
  'productTenantId',
])
export class LegalAcceptance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ name: 'identity_issuer', length: 120 })
  identityIssuer: string;

  @Column({ name: 'subject_id', length: 160 })
  subjectId: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @ManyToOne(() => LegalDocument, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_id' })
  document: LegalDocument;

  @Column({ name: 'document_version_id', type: 'uuid' })
  documentVersionId: string;

  @ManyToOne(() => LegalDocumentVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_version_id' })
  documentVersion: LegalDocumentVersion;

  @Column({ name: 'acceptance_rule_id', type: 'uuid' })
  acceptanceRuleId: string;

  @ManyToOne(() => LegalAcceptanceRule, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'acceptance_rule_id' })
  acceptanceRule: LegalAcceptanceRule;

  @Column({ name: 'accepted_by_identity_issuer', length: 120 })
  acceptedByIdentityIssuer: string;

  @Column({ name: 'accepted_by_subject_id', length: 160 })
  acceptedBySubjectId: string;

  @Column({ name: 'acceptance_mode', length: 40 })
  acceptanceMode: string;

  @Column({
    name: 'role_at_acceptance',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  roleAtAcceptance: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 80, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 160, nullable: true })
  sessionId: string | null;

  @Column({
    name: 'authentication_method',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  authenticationMethod: string | null;

  @Column({ type: 'varchar', length: 12, nullable: true })
  locale: string | null;

  @Column({ name: 'content_hash', length: 64 })
  contentHash: string;

  @Column({ name: 'accepted_at', type: 'timestamptz' })
  acceptedAt: Date;

  @Column({
    name: 'metadata',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
