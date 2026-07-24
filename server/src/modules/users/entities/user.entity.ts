import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Region } from '../../locations/entities/region.entity';
import { City } from '../../locations/entities/city.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { UserGroup } from './user-group.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  /** Per-user permission overrides. Keys are feature names, values are
   * true (granted), false (denied), or absent (inherit from group,
   * then role). See resolveEffectivePermissions(). */
  @Column({ type: 'jsonb', default: {} })
  permissions: Record<string, boolean>;

  /** Optional group whose permissions apply between the role default
   * and this user's own overrides. Lets an admin manage permissions
   * for a whole team at once instead of user-by-user. */
  @ManyToOne(() => UserGroup, { nullable: true, onDelete: 'SET NULL' })
  group?: UserGroup;

  // Default language is Hebrew per spec; client falls back to this on login.
  @Column({ default: 'he' })
  language: string;

  // --- Call routing fields (added for regional call assignment) ---

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true })
  specialization?: string;

  @Column({ nullable: true })
  phone?: string;

  /** Only meaningful for a super-admin account (organizationId ===
   * null) — drives whether the Setup Wizard auto-opens on login. Once
   * true, the wizard is only reachable manually from Settings. */
  @Column({ default: false })
  setupWizardCompleted: boolean;

  /** When this user accepted the current Terms of Service — null
   * means they haven't yet. Every user (any role, any organization)
   * must accept before using the app; unlike setupWizardCompleted
   * this isn't super-admin-only. Bumping TOS_VERSION (see
   * auth.controller.ts) re-requires acceptance from everyone, since a
   * changed document isn't the same agreement the null check alone
   * would imply. */
  @Column({ type: 'timestamp', nullable: true })
  tosAcceptedAt?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  tosAcceptedVersion?: string | null;

  // Technician's base city (informational/display) — distinct from
  // `regions` below, which drives call notification routing.
  @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
  city?: City;

  // The regions a technician is responsible for — new calls in any of
  // these regions notify this user. Independent of `isGlobal` below;
  // a global user doesn't need any regions assigned at all.
  @ManyToMany(() => Region)
  @JoinTable({ name: 'user_regions' })
  regions: Region[];

  // "Глобальный" status: receives notifications for every new call
  // regardless of region, in addition to (not instead of) any
  // region-specific technicians.
  @Column({ default: false })
  isGlobal: boolean;

  // Real OS-level push (FCM) — set when the mobile app registers a
  // device token after login; cleared on logout. Android only for now
  // (no Apple Developer Program account yet for iOS APNs — see
  // push_notifications_service.dart on the client for the full
  // explanation), so platform is always 'android' in practice today,
  // but kept as a column rather than assumed so iOS can register
  // alongside it later without a schema change.
  @Column({ nullable: true })
  pushToken?: string;

  @Column({ nullable: true })
  pushPlatform?: string;

  // Multi-tenant boundary. Null = super-admin (sees/manages everything
  // across all organizations) — naturally true for the bootstrap admin
  // created when the server was first set up, since nothing ever assigns
  // it one. Any other user (admin or regular) with this set only sees
  // data belonging to their own organization.
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  organization?: Organization;

  /** Organizations this user is allowed to switch into (mobile org-switcher).
   *  Stored as an array of org IDs. Empty = only their own org. */
  @Column({ type: 'jsonb', default: [] })
  allowedOrganizationIds: number[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
