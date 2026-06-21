import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { City } from './city.entity';
import { Organization } from '../../organizations/entities/organization.entity';

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
@Index(['name', 'city', 'organization'], { unique: true })
export class Location {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => City, { onDelete: 'RESTRICT' })
  city: City;

  // Nullable for backward compatibility with locations created before
  // multi-tenancy existed — those stay visible only to the super-admin
  // (organization === null) until reassigned. New locations created by
  // an org-scoped admin get this auto-set to their organization.
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;
}
