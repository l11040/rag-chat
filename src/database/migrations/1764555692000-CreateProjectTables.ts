import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateProjectTables1764555692000 implements MigrationInterface {
  name = 'CreateProjectTables1764555692000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. projects 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'projects',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          }),
          new TableColumn({
            name: 'description',
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
        engine: 'InnoDB',
      }),
      true,
    );

    // 2. project_members 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'project_members',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'projectId',
            type: 'varchar',
            length: '36',
            isNullable: false,
          }),
          new TableColumn({
            name: 'userId',
            type: 'varchar',
            length: '36',
            isNullable: false,
          }),
          new TableColumn({
            name: 'role',
            type: 'enum',
            enum: ['member', 'project_manager'],
            default: "'member'",
            isNullable: false,
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
            name: 'IDX_project_members_project_user',
            columnNames: ['projectId', 'userId'],
            isUnique: true,
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['projectId'],
            referencedTableName: 'projects',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        engine: 'InnoDB',
      }),
      true,
    );

    // 3. project_notion_pages 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'project_notion_pages',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'projectId',
            type: 'varchar',
            length: '36',
            isNullable: false,
          }),
          new TableColumn({
            name: 'notionPageId',
            type: 'varchar',
            length: '36',
            isNullable: false,
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
            name: 'IDX_project_notion_pages_project_page',
            columnNames: ['projectId', 'notionPageId'],
            isUnique: true,
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['projectId'],
            referencedTableName: 'projects',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            columnNames: ['notionPageId'],
            referencedTableName: 'notion_pages',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        engine: 'InnoDB',
      }),
      true,
    );

    // 4. project_swagger_documents 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'project_swagger_documents',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'projectId',
            type: 'varchar',
            length: '36',
            isNullable: false,
          }),
          new TableColumn({
            name: 'swaggerDocumentId',
            type: 'varchar',
            length: '36',
            isNullable: false,
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
            name: 'IDX_project_swagger_docs_project_doc',
            columnNames: ['projectId', 'swaggerDocumentId'],
            isUnique: true,
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['projectId'],
            referencedTableName: 'projects',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            columnNames: ['swaggerDocumentId'],
            referencedTableName: 'swagger_documents',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        engine: 'InnoDB',
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('project_swagger_documents');
    await queryRunner.dropTable('project_notion_pages');
    await queryRunner.dropTable('project_members');
    await queryRunner.dropTable('projects');
  }
}

