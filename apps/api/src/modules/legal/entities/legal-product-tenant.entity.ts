import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LegalTenantMembership } from './legal-tenant-membership.entity';

@Entity('product_tenants')
@Index('IDX_legal_product_tenants_organization_unique', ['organizationId'], {
  unique: true,
})
@Index('IDX_legal_product_tenants_external_unique', ['externalTenantId'], {
  unique: true,
})
export class LegalProductTenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', length: 120 })
  organizationId: string;

  @Column({ name: 'external_tenant_id', type: 'varchar', length: 160, nullable: true })
  externalTenantId: string | null;

  @Column({ length: 120 })
  code: string;

  @Column({ length: 160 })
  name: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  configuration: Record<string, unknown>;

  @OneToMany(() => LegalTenantMembership, (membership) => membership.tenant)
  memberships: LegalTenantMembership[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
