import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * A short-lived bridge between the Google OAuth redirect (which lands
 * back in the browser with no way to hand data straight to a JS fetch()
 * call — it's a full page navigation, not an XHR) and the admin panel
 * picking up the fetched contact list: the callback stores what it got
 * from the People API here, redirects the browser back to the phone
 * book page with this row's id in the URL, and the page's next request
 * reads (and deletes) it. Same pattern as ScanSession's server-side
 * buffer, much shorter-lived — rows are deleted the moment they're read,
 * with an hourly sweep (see PhoneBookService.cleanupStaleImportSessions)
 * for anything abandoned (browser closed mid-flow, etc).
 */
@Entity('phonebook_google_import_sessions')
export class GoogleImportSession {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'jsonb' })
  parsedContacts: unknown;

  @Column({ nullable: true })
  error?: string;

  @CreateDateColumn()
  createdAt: Date;
}
