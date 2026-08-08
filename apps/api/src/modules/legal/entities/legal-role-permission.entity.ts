import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { LegalRole } from './legal-role.entity';

@Entity('role_permissions')
@Index('IDX_legal_role_permissions_unique', ['roleId', 'permissionCode'], {
  unique: true,
})
export class LegalRolePermission {
  @Column({ name: 'role_id', type: 'uuid', primary: true })
  roleId: string;

  @ManyToOne(() => LegalRole, (role) => role.permissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role: LegalRole;

  @Column({ name: 'permission_code', length: 120, primary: true })
  permissionCode: string;
}
