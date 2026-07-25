import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Requirement #16 ("журнал действий пользователя, история изменений").
 * Populated by AuditLogInterceptor, which fires on every mutating
 * request (POST/PATCH/PUT/DELETE) across the whole app — see that
 * file for why a global interceptor rather than manual logging calls
 * scattered through every service was the practical way to get broad
 * coverage without touching dozens of files individually.
 */
@Entity('audit_log')
export class AuditLogEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  user?: User;

  /** Denormalized alongside the relation — kept even if the user
   * account is later deleted, since "who did this" needs to survive
   * account deletion for the log to be worth anything. */
  @Column({ type: 'varchar', nullable: true })
  username?: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @Index()
  organization?: Organization;

  @Column({ type: 'varchar' })
  method: string;

  @Column({ type: 'varchar' })
  @Index()
  path: string;

  /** Best-effort resource type/id parsed from the path (e.g.
   * "invoices"/"42") — makes "show me everything that happened to
   * invoice #42" a simple query instead of a path LIKE scan. Null
   * when the path doesn't match the usual /resource/:id shape. */
  @Column({ type: 'varchar', nullable: true })
  @Index()
  resourceType?: string | null;

  @Column({ type: 'varchar', nullable: true })
  resourceId?: string | null;

  @Column({ type: 'integer' })
  statusCode: number;

  /** Request body, with anything that looks like a password/secret
   * key stripped — see AuditLogInterceptor.sanitizeBody(). Truncated
   * to a reasonable size so one enormous request (e.g. a base64
   * signature blob) can't bloat this table unboundedly. */
  @Column({ type: 'jsonb', nullable: true })
  requestBody?: unknown;

  @Column({ type: 'varchar', nullable: true })
  ipAddress?: string | null;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
