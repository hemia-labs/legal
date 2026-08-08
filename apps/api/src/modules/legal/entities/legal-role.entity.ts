import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LegalRolePermission } from './legal-role-permission.entity';
import { LegalTenantMembership } from './legal-tenant-membership.entity';

@Entity('roles')
@Index('IDX_legal_roles_code_unique', ['code'], { unique: true })
export class LegalRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 80 })
  code: string;

  @Column({ length: 160 })
  name: string;

  @Column({ name: 'is_system', default: true })
  isSystem: boolean;

  @OneToMany(() => LegalRolePermission, (permission) => permission.role)
  permissions: LegalRolePermission[];

  @OneToMany(() => LegalTenantMembership, (membership) => membership.role)
  memberships: LegalTenantMembership[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
