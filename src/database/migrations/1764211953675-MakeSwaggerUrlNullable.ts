import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeSwaggerUrlNullable1764211953675 implements MigrationInterface {
  name = 'MakeSwaggerUrlNullable1764211953675';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`swagger_documents\` DROP COLUMN \`swaggerUrl\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`swagger_documents\` ADD \`swaggerUrl\` varchar(500) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`swagger_documents\` DROP COLUMN \`swaggerUrl\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`swagger_documents\` ADD \`swaggerUrl\` varchar(255) NOT NULL`,
    );
  }
}
