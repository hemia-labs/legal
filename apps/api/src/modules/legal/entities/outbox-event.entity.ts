import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('outbox_events')
@Index('IDX_legal_outbox_status_created_at', ['status', 'createdAt'])
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trace_id', length: 80 })
  traceId: string;

  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  correlationId: string | null;

  @Column({
    name: 'trace_parent',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  traceParent: string | null;

  @Column({ type: 'varchar', length: 240, nullable: true })
  subject: string | null;

  @Column({ name: 'event_type', length: 120 })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ name: 'attempt_count', default: 0 })
  attemptCount: number;

  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true })
  nextRunAt: Date | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
