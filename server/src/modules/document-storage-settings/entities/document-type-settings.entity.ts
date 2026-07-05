import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { StorageConnection } from '../../storage/entities/storage-connection.entity';

export enum DocumentCategory {
  DELIVERY_NOTE = 'delivery_note',       // Накладные
  RECOUNT = 'recount',                   // Документы переучета (Домашняя tab upload)
  TRANSFER = 'transfer',                 // Накладные перевода между складами
  FLEET = 'fleet',                       // Автопарк
  WAREHOUSE = 'warehouse',               // Склад
}

/**
 * Per-organization, per-document-type storage routing: which storage
 * connection a generated/uploaded document goes to, under what folder
 * path, and with what filename — all built from a small template
 * language (see TEMPLATE_VARIABLES below). Configured on the admin
 * panel's "Routing" page.
 */
@Entity('document_type_settings')
export class DocumentTypeSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: DocumentCategory })
  documentType: DocumentCategory;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  storageConnection?: StorageConnection;

  /** Folder path, e.g. "{location}/{date}" */
  @Column({ default: '{location}/{date}' })
  pathPattern: string;

  /** Filename (without extension), e.g. "{docType}-{number}_{location}" */
  @Column({ default: '{docType}-{number}' })
  filenameTemplate: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Variables available in pathPattern/filenameTemplate, resolved by the
 * client when it builds the actual file path/name for a given document. */
export const TEMPLATE_VARIABLES = [
  { key: 'creatorName', label: 'Имя и фамилия создающего документ' },
  { key: 'date', label: 'Дата создания документа' },
  { key: 'number', label: 'Номер документа' },
  { key: 'location', label: 'Локация, к которой принадлежит документ' },
  { key: 'docType', label: 'Тип документа (сокращённо: תעודת משלוח → תמ, חשבונית → חן)' },
] as const;
