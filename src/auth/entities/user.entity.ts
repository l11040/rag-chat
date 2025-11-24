import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string; // MariaDB에서는 VARCHAR(36)으로 저장됨

  @Column({ unique: true })
  email: string;

  @Column()
  password: string; // bcrypt로 해시된 비밀번호

  @Column({ nullable: true })
  refreshToken: string; // Refresh Token 저장

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
