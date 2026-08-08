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
import { LegalProductTenant } from './legal-product-tenant.entity';
import { LegalRole } from './legal-role.entity';

@Entity('tenant_memberships')
@Index('IDX_legal_memberships_identity_tenant_unique', [
  'tenantId',
  'identityIssuer',
  'subjectId',
], { unique: true })
export class LegalTenantMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => LegalProductTenant, (tenant) => tenant.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant: LegalProductTenant;

  @Column({ name: 'identity_issuer', length: 120 })
  identityIssuer: string;

  @Column({ name: 'subject_id', length: 160 })
  subjectId: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @ManyToOne(() => LegalRole, (role) => role.memberships, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'role_id' })
  role: LegalRole;

  @Column({ length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
