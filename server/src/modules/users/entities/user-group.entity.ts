import {
  Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * A named permission set an admin can assign users to, instead of
 * setting overrides one user at a time. Resolution order at login is
 * user.permissions > group.permissions > role default — see
 * resolveEffectivePermissions() in permissions.constants.ts.
 */
@Entity('user_groups')
export class UserGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'jsonb', default: {} })
  permissions: Record<string, boolean>;

  // Groups are per-organization, same multi-tenant boundary as
  // everything else — a super-admin (organization === null) can see
  // and manage all of them.
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
