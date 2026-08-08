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
import { LegalIssuer } from './legal-issuer.entity';

@Entity('applications')
@Index('IDX_legal_applications_issuer_key_unique', ['issuerId', 'key'], {
  unique: true,
})
export class LegalApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'issuer_id', type: 'uuid' })
  issuerId: string;

  @ManyToOne(() => LegalIssuer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issuer_id' })
  issuer: LegalIssuer;

  @Column({ length: 80 })
  key: string;

  @Column({ length: 160 })
  name: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
