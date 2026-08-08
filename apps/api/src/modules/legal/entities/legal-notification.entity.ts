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
import { OutboxEvent } from './outbox-event.entity';

@Entity('notifications')
@Index('IDX_legal_notifications_status_next_run', ['status', 'nextRunAt'])
@Index('IDX_legal_notifications_context', [
  'issuerId',
  'applicationId',
  'documentVersionId',
  'status',
])
@Index(
  'IDX_legal_notifications_source_recipient_unique',
  ['sourceEventId', 'channel', 'recipientLogicalId'],
  { unique: true, where: '"source_event_id" IS NOT NULL' },
)
export class LegalNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_event_id', type: 'uuid', nullable: true })
  sourceEventId: string | null;

  @ManyToOne(() => OutboxEvent, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_event_id' })
  sourceEvent: OutboxEvent | null;

  @Column({ name: 'issuer_id', type: 'uuid' })
  issuerId: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId: string | null;

  @Column({ name: 'document_version_id', type: 'uuid', nullable: true })
  documentVersionId: string | null;

  @Column({ name: 'acceptance_rule_id', type: 'uuid', nullable: true })
  acceptanceRuleId: string | null;

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

  @Column({ length: 20 })
  channel: string;

  @Column({ name: 'recipient_logical_id', length: 320 })
  recipientLogicalId: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ name: 'attempt_count', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true })
  nextRunAt: Date | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
