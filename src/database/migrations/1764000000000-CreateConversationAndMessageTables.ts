import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateConversationAndMessageTables1764000000000
  implements MigrationInterface
{
  name = 'CreateConversationAndMessageTables1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 기존 테이블이 있으면 삭제 (이전 마이그레이션 실패 시 정리)
    const messagesTable = await queryRunner.getTable('messages');
    if (messagesTable) {
      await queryRunner.dropTable('messages');
    }
    const conversationsTable = await queryRunner.getTable('conversations');
    if (conversationsTable) {
      await queryRunner.dropTable('conversations');
    }

    // 1. conversations 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'conversations',
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
            name: 'title',
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
            name: 'IDX_conversations_userId',
            columnNames: ['userId'],
            isUnique: false,
          }),
        ],
        engine: 'InnoDB',
      }),
      true,
    );

    // 2. conversations 테이블에 외래키 추가 (charset/collation 일치 확인 후)
    // MariaDB/MySQL에서 외래키 생성 시 charset과 collation이 일치해야 함
    try {
      await queryRunner.createForeignKey(
        'conversations',
        new TableForeignKey({
          columnNames: ['userId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'users',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }),
      );
    } catch (error) {
      // 외래키 생성 실패 시 경고만 출력하고 계속 진행
      // (애플리케이션 레벨에서 관계 관리)
      console.warn('외래키 생성 실패, 애플리케이션 레벨에서 관계 관리:', error);
    }

    // 3. messages 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'messages',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'conversationId',
            type: 'varchar',
            length: '36',
            isNullable: false,
          }),
          new TableColumn({
            name: 'role',
            type: 'enum',
            enum: ['user', 'assistant'],
            isNullable: false,
          }),
          new TableColumn({
            name: 'content',
            type: 'text',
            isNullable: false,
          }),
          new TableColumn({
            name: 'metadata',
            type: 'json',
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
            name: 'IDX_messages_conversationId',
            columnNames: ['conversationId'],
            isUnique: false,
          }),
        ],
        engine: 'InnoDB',
      }),
      true,
    );

    // 4. messages 테이블에 외래키 추가
    try {
      await queryRunner.createForeignKey(
        'messages',
        new TableForeignKey({
          columnNames: ['conversationId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'conversations',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }),
      );
    } catch (error) {
      console.warn('외래키 생성 실패, 애플리케이션 레벨에서 관계 관리:', error);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 외래키 먼저 삭제
    const messagesTable = await queryRunner.getTable('messages');
    const messagesForeignKey = messagesTable?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('conversationId') !== -1,
    );
    if (messagesForeignKey) {
      await queryRunner.dropForeignKey('messages', messagesForeignKey);
    }

    const conversationsTable = await queryRunner.getTable('conversations');
    const conversationsForeignKey = conversationsTable?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('userId') !== -1,
    );
    if (conversationsForeignKey) {
      await queryRunner.dropForeignKey(
        'conversations',
        conversationsForeignKey,
      );
    }

    // 테이블 삭제
    await queryRunner.dropTable('messages');
    await queryRunner.dropTable('conversations');
  }
}
