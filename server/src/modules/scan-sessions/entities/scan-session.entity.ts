import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * A temporary buffer for a photo that's been captured but not yet
 * confirmed: server-side scratch space for the capture -> auto-detect ->
 * let the user drag corners / pick a filter / preview -> confirm flow.
 * Nothing here is visible anywhere else in the app (not in File log, not
 * in storage) until finalize() promotes it into a real FileRecord — see
 * ScanSessionsService. Rows are deleted on finalize/cancel, and a
 * scheduled cleanup (see ScanSessionsService.cleanupStale) removes
 * anything abandoned (app closed mid-review, etc.) after 24h.
 */
@Entity('scan_sessions')
export class ScanSession {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'bytea' })
  originalImage: Buffer;

  @Column()
  imageWidth: number;

  @Column()
  imageHeight: number;

  // The auto-detected quad/curve, kept so a preview/finalize call that
  // echoes back these exact corners unmodified can still get the
  // curved-boundary correction (see document-scanner.ts) — a manually
  // dragged quad no longer matches this and falls back to a plain
  // 4-point transform.
  @Column({ type: 'jsonb', nullable: true })
  detectedCorners: { x: number; y: number }[] | null;

  @Column({ type: 'jsonb', nullable: true })
  detectedTopCurve: number[] | null;

  @Column({ type: 'jsonb', nullable: true })
  detectedBottomCurve: number[] | null;

  @Column({ type: 'jsonb', nullable: true })
  detectedLeftCurve: number[] | null;

  @Column({ type: 'jsonb', nullable: true })
  detectedRightCurve: number[] | null;

  @Column()
  place: string;

  @Column()
  docType: string;

  @Column()
  originalFilename: string;

  @CreateDateColumn()
  createdAt: Date;
}
