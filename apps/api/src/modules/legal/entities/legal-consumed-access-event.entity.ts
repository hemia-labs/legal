import { Column, CreateDateColumn, Entity, Index } from 'typeorm';

@Entity('consumed_access_events')
@Index('IDX_legal_consumed_access_events_unique', ['eventId', 'consumerName'], {
  unique: true,
})
export class LegalConsumedAccessEvent {
  @Column({ name: 'event_id', length: 160, primary: true })
  eventId: string;

  @Column({ name: 'consumer_name', length: 120, primary: true })
  consumerName: string;

  @Column({ name: 'event_type', length: 160 })
  eventType: string;

  @CreateDateColumn({ name: 'consumed_at' })
  consumedAt: Date;
}
