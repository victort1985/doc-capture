import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Deal } from './deal.entity';

export enum InteractionType {
  CALL = 'call',
  MEETING = 'meeting',
  EMAIL = 'email',
  NOTE = 'note',
}

@Entity('crm_deal_interactions')
export class DealInteraction {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Deal, { onDelete: 'CASCADE' })
  deal: Deal;

  @ManyToOne(() => User)
  author: User;

  @Column({ type: 'enum', enum: InteractionType })
  type: InteractionType;

  @Column({ type: 'text' })
  text: string;

  @CreateDateColumn()
  createdAt: Date;
}
