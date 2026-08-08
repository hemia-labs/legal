import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_events')
@Index('IDX_legal_audit_context', ['issuerId', 'applicationId', 'createdAt'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'issuer_id', type: 'uuid', nullable: true })
  issuerId: string | null;

  @Column({ name: 'application_id', type: 'uuid', nullable: true })
  applicationId: string | null;

  @Column({ name: 'trace_id', length: 80 })
  traceId: string;

  @Column({ name: 'actor_identity_issuer', length: 120 })
  actorIdentityIssuer: string;

  @Column({ name: 'actor_subject_id', length: 160 })
  actorSubjectId: string;

  @Column({ name: 'actor_type', length: 40 })
  actorType: string;

  @Column({ length: 120 })
  action: string;

  @Column({ name: 'entity_type', length: 80 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
