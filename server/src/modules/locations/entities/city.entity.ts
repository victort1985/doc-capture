import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Region } from './region.entity';

@Entity('cities')
@Index(['name', 'region'], { unique: true })
export class City {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => Region, { onDelete: 'RESTRICT' })
  region: Region;

  @CreateDateColumn()
  createdAt: Date;
}
