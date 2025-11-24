import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRoleToUser1763996237000 implements MigrationInterface {
  name = 'AddRoleToUser1763996237000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 컬럼이 이미 존재하는지 확인
    const table = await queryRunner.getTable('users');
    const roleColumn = table?.findColumnByName('role');

    if (!roleColumn) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'role',
          type: 'enum',
          enum: ['user', 'project_manager', 'sub_admin', 'admin'],
          default: "'user'",
          isNullable: false,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const roleColumn = table?.findColumnByName('role');

    if (roleColumn) {
      await queryRunner.dropColumn('users', 'role');
    }
  }
}
