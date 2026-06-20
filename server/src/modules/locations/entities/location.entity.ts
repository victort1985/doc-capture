import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { City } from './city.entity';

/**
 * Single shared "place" directory. Reused for two purposes by design
 * (confirmed explicitly, not an assumption):
 * - "Место" (place) field in service calls and in inventory photo
 *   uploads — replaces what used to be free-text typing every time.
 * - "Организация" (organization) field on phone book contacts — a
 *   contact's organization IS a Location, so "people who work at this
 *   place" for a call is simply: phone book contacts whose `location`
 *   matches the call's `location`.
 */
@Entity('locations')
@Index(['name', 'city'], { unique: true })
export class Location {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => City, { onDelete: 'RESTRICT' })
  city: City;

  @CreateDateColumn()
  createdAt: Date;
}
