import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('publication_assets')
@Index('IDX_legal_publication_assets_publication_kind_unique', ['publicationId', 'kind'], {
  unique: true,
})
export class LegalPublicationAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'publication_id', type: 'uuid' })
  publicationId: string;

  @Column({ length: 20 })
  kind: string;

  @Column({ name: 's3_bucket', length: 255 })
  s3Bucket: string;

  @Column({ name: 's3_object_key', length: 1024 })
  s3ObjectKey: string;

  @Column({ name: 's3_version_id', type: 'varchar', length: 255, nullable: true })
  s3VersionId: string | null;

  @Column({ name: 'content_type', length: 120 })
  contentType: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: number;

  @Column({ name: 'sha256', length: 64 })
  sha256: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
