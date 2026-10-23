import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ServicePolicyDto } from '../service-clients/service-client.dto';
@Entity('legal_service_clients')
@Index('IDX_legal_service_clients_identity', ['oauthIssuer', 'clientId'], {
  unique: true,
})
export class LegalServiceClient {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'oauth_issuer', type: 'varchar', length: 2048 })
  oauthIssuer: string;
  @Column({ name: 'client_id', type: 'varchar', length: 120 }) clientId: string;
  @Column({ type: 'boolean', default: false }) enabled: boolean;
  @Column({ type: 'jsonb' }) policy: ServicePolicyDto;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
