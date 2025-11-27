import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddKeyToSwaggerDocument1764003000000
  implements MigrationInterface
{
  name = 'AddKeyToSwaggerDocument1764003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('swagger_documents');
    const keyColumn = table?.findColumnByName('key');

    // key 컬럼이 없으면 추가
    if (!keyColumn) {
      await queryRunner.addColumn(
        'swagger_documents',
        new TableColumn({
          name: 'key',
          type: 'varchar',
          length: '100',
          isNullable: false,
          isUnique: true,
        }),
      );

      // 기존 데이터가 있으면 임시 키 생성
      const existingDocs = (await queryRunner.query(
        'SELECT id FROM swagger_documents',
      )) as Array<{ id: string }>;
      for (const doc of existingDocs) {
        const tempKey = `swagger_${doc.id.substring(0, 8)}`;
        await queryRunner.query(
          `UPDATE swagger_documents SET \`key\` = ? WHERE id = ?`,
          [tempKey, doc.id],
        );
      }
    }

    // swaggerUrl의 unique 제거
    const swaggerUrlColumn = table?.findColumnByName('swaggerUrl');
    if (swaggerUrlColumn?.isUnique) {
      // 인덱스 찾기
      const indexes = (await queryRunner.query(
        `SHOW INDEX FROM swagger_documents WHERE Column_name = 'swaggerUrl' AND Non_unique = 0`,
      )) as Array<{ Key_name: string }>;
      for (const index of indexes) {
        await queryRunner.query(
          `ALTER TABLE swagger_documents DROP INDEX ${index.Key_name}`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('swagger_documents');
    const keyColumn = table?.findColumnByName('key');

    if (keyColumn) {
      // unique 인덱스 제거
      const indexes = (await queryRunner.query(
        `SHOW INDEX FROM swagger_documents WHERE Column_name = 'key' AND Non_unique = 0`,
      )) as Array<{ Key_name: string }>;
      for (const index of indexes) {
        await queryRunner.query(
          `ALTER TABLE swagger_documents DROP INDEX ${index.Key_name}`,
        );
      }

      await queryRunner.dropColumn('swagger_documents', 'key');
    }

    // swaggerUrl에 unique 다시 추가
    await queryRunner.query(
      `ALTER TABLE swagger_documents ADD UNIQUE INDEX IDX_swagger_documents_swaggerUrl (swaggerUrl)`,
    );
  }
}
