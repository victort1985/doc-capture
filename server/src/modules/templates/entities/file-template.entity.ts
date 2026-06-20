import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum TemplateAppliesTo {
  DOCUMENT = 'document',
  PHOTO = 'photo',
  BOTH = 'both',
  // Global (no per-user variant) filename pattern for phone book contact
  // files — separate placeholder set ({organization} {city} {position}
  // {firstName} {lastName} {year}), so it doesn't mix with the
  // document/photo upload templates above.
  PHONEBOOK = 'phonebook',
}

@Entity('file_templates')
export class FileTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  // Supported placeholders: {date} {time} {place} {username} {docType} {counter} {uuid}
  @Column()
  pattern: string;

  @Column({ type: 'enum', enum: TemplateAppliesTo, default: TemplateAppliesTo.BOTH })
  appliesTo: TemplateAppliesTo;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  user?: User;

  @CreateDateColumn()
  createdAt: Date;
}
