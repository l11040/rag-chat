import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class CreateNotionPageTable1763998000000 implements MigrationInterface {
  name = 'CreateNotionPageTable1763998000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notion_pages',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'notionPageId',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'title',
            type: 'varchar',
            length: '500',
            isNullable: false,
          }),
          new TableColumn({
            name: 'url',
            type: 'text',
            isNullable: true,
          }),
          new TableColumn({
            name: 'databaseId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          }),
          new TableColumn({
            name: 'chunkCount',
            type: 'int',
            default: 0,
            isNullable: false,
          }),
          new TableColumn({
            name: 'indexingStatus',
            type: 'enum',
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: "'pending'",
            isNullable: false,
          }),
          new TableColumn({
            name: 'lastIndexedAt',
            type: 'datetime',
            precision: 6,
            isNullable: true,
          }),
          new TableColumn({
            name: 'lastModifiedAt',
            type: 'datetime',
            precision: 6,
            isNullable: true,
          }),
          new TableColumn({
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          }),
          new TableColumn({
            name: 'createdAt',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          }),
          new TableColumn({
            name: 'updatedAt',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            onUpdate: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_notion_pages_indexingStatus',
            columnNames: ['indexingStatus'],
            isUnique: false,
          }),
        ],
        engine: 'InnoDB',
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notion_pages');
  }
}
