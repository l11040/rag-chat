import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateTokenUsageTable1764001000000 implements MigrationInterface {
  name = 'CreateTokenUsageTable1764001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 기존 테이블이 있으면 삭제 (이전 마이그레이션 실패 시 정리)
    const tokenUsagesTable = await queryRunner.getTable('token_usages');
    if (tokenUsagesTable) {
      await queryRunner.dropTable('token_usages');
    }

    // token_usages 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'token_usages',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'userId',
            type: 'varchar',
            length: '36',
            isNullable: false,
          }),
          new TableColumn({
            name: 'conversationId',
            type: 'varchar',
            length: '36',
            isNullable: true,
          }),
          new TableColumn({
            name: 'messageId',
            type: 'varchar',
            length: '36',
            isNullable: true,
          }),
          new TableColumn({
            name: 'promptTokens',
            type: 'int',
            default: 0,
            isNullable: false,
          }),
          new TableColumn({
            name: 'completionTokens',
            type: 'int',
            default: 0,
            isNullable: false,
          }),
          new TableColumn({
            name: 'totalTokens',
            type: 'int',
            default: 0,
            isNullable: false,
          }),
          new TableColumn({
            name: 'question',
            type: 'varchar',
            length: '500',
            isNullable: true,
          }),
          new TableColumn({
            name: 'createdAt',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_token_usages_userId',
            columnNames: ['userId'],
            isUnique: false,
          }),
          new TableIndex({
            name: 'IDX_token_usages_conversationId',
            columnNames: ['conversationId'],
            isUnique: false,
          }),
          new TableIndex({
            name: 'IDX_token_usages_messageId',
            columnNames: ['messageId'],
            isUnique: false,
          }),
        ],
        engine: 'InnoDB',
      }),
      true,
    );

    // userId 외래키 추가
    try {
      await queryRunner.createForeignKey(
        'token_usages',
        new TableForeignKey({
          columnNames: ['userId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'users',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }),
      );
    } catch (error) {
      console.warn('외래키 생성 실패, 애플리케이션 레벨에서 관계 관리:', error);
    }

    // conversationId 외래키 추가
    try {
      await queryRunner.createForeignKey(
        'token_usages',
        new TableForeignKey({
          columnNames: ['conversationId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'conversations',
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        }),
      );
    } catch (error) {
      console.warn('외래키 생성 실패, 애플리케이션 레벨에서 관계 관리:', error);
    }

    // messageId 외래키 추가
    try {
      await queryRunner.createForeignKey(
        'token_usages',
        new TableForeignKey({
          columnNames: ['messageId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'messages',
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        }),
      );
    } catch (error) {
      console.warn('외래키 생성 실패, 애플리케이션 레벨에서 관계 관리:', error);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 외래키 먼저 삭제
    const tokenUsagesTable = await queryRunner.getTable('token_usages');

    const messageForeignKey = tokenUsagesTable?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('messageId') !== -1,
    );
    if (messageForeignKey) {
      await queryRunner.dropForeignKey('token_usages', messageForeignKey);
    }

    const conversationForeignKey = tokenUsagesTable?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('conversationId') !== -1,
    );
    if (conversationForeignKey) {
      await queryRunner.dropForeignKey('token_usages', conversationForeignKey);
    }

    const userForeignKey = tokenUsagesTable?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('userId') !== -1,
    );
    if (userForeignKey) {
      await queryRunner.dropForeignKey('token_usages', userForeignKey);
    }

    // 테이블 삭제
    await queryRunner.dropTable('token_usages');
  }
}
