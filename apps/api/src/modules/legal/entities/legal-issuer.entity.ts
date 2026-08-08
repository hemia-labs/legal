import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('issuers')
export class LegalIssuer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_legal_issuers_key_unique', { unique: true })
  @Column({ length: 80 })
  key: string;

  @Column({ length: 160 })
  name: string;

  @Column({ name: 'legal_name', length: 200 })
  legalName: string;

  @Column({ length: 40 })
  type: string;

  @Column({ name: 'tax_id', type: 'varchar', length: 80, nullable: true })
  taxId: string | null;

  @Column({ name: 'country_code', length: 2 })
  countryCode: string;

  @Column({ name: 'default_locale', length: 12 })
  defaultLocale: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
