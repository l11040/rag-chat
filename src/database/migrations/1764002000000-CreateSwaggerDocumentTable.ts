import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class CreateSwaggerDocumentTable1764002000000
  implements MigrationInterface
{
  name = 'CreateSwaggerDocumentTable1764002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // swagger_documents 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'swagger_documents',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'swaggerUrl',
            type: 'varchar',
            length: '500',
            isNullable: false,
            isUnique: true,
          }),
          new TableColumn({
            name: 'title',
            type: 'varchar',
            length: '500',
            isNullable: true,
          }),
          new TableColumn({
            name: 'version',
            type: 'varchar',
            length: '500',
            isNullable: true,
          }),
          new TableColumn({
            name: 'description',
            type: 'text',
            isNullable: true,
          }),
          new TableColumn({
            name: 'apiCount',
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
            name: 'IDX_swagger_documents_indexingStatus',
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
    await queryRunner.dropTable('swagger_documents');
  }
}
