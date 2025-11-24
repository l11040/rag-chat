import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password } = registerDto;

    // 이메일 중복 확인
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    // 비밀번호 해싱
    const saltRounds = 12; // 높은 보안을 위한 salt rounds
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 사용자 생성
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
    });

    await this.userRepository.save(user);

    // 토큰 생성
    const tokens = await this.generateTokens(user);

    // Refresh Token 저장
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      success: true,
      message: '회원가입이 완료되었습니다.',
      user: {
        id: user.id,
        email: user.email,
      },
      ...tokens,
    };
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    // 토큰 생성
    const tokens = await this.generateTokens(user);

    // Refresh Token 저장
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      success: true,
      message: '로그인 성공',
      user: {
        id: user.id,
        email: user.email,
      },
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret:
            this.configService.get<string>('JWT_REFRESH_SECRET') ||
            'your-refresh-secret-key',
        },
      );

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user || user.refreshToken !== refreshToken) {
        throw new UnauthorizedException('유효하지 않은 Refresh Token입니다.');
      }

      // 새 토큰 생성
      const tokens = await this.generateTokens(user);

      // Refresh Token 업데이트
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return {
        success: true,
        ...tokens,
      };
    } catch {
      throw new UnauthorizedException('유효하지 않은 Refresh Token입니다.');
    }
  }

  async logout(userId: string) {
    await this.userRepository.update(userId, {
      refreshToken: undefined,
    });

    return {
      success: true,
      message: '로그아웃되었습니다.',
    };
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessTokenExpiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') || '15m';
    const refreshTokenExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

    const accessTokenOptions = {
      secret: this.configService.get<string>('JWT_SECRET') || 'your-secret-key',
      expiresIn: accessTokenExpiresIn,
    } as JwtSignOptions;

    const refreshTokenOptions = {
      secret:
        this.configService.get<string>('JWT_REFRESH_SECRET') ||
        'your-refresh-secret-key',
      expiresIn: refreshTokenExpiresIn,
    } as JwtSignOptions;

    const accessToken = await this.jwtService.signAsync(
      payload,
      accessTokenOptions,
    );

    const refreshToken = await this.jwtService.signAsync(
      payload,
      refreshTokenOptions,
    );

    return {
      accessToken,
      refreshToken,
    };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    await this.userRepository.update(userId, { refreshToken });
  }

  async findAllUsers() {
    const users = await this.userRepository.find({
      select: ['id', 'email', 'role', 'createdAt', 'updatedAt'],
      order: { createdAt: 'DESC' },
    });

    return {
      success: true,
      users,
    };
  }

  async findUserById(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'role', 'createdAt', 'updatedAt'],
    });

    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    return {
      success: true,
      user,
    };
  }

  async updateUser(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    // 이메일 변경 시 중복 확인
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('이미 사용 중인 이메일입니다.');
      }
    }

    // 비밀번호 변경 시 해싱
    if (updateUserDto.password) {
      const saltRounds = 12;
      updateUserDto.password = await bcrypt.hash(
        updateUserDto.password,
        saltRounds,
      );
    }

    await this.userRepository.update(userId, updateUserDto);

    const updatedUser = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'role', 'createdAt', 'updatedAt'],
    });

    return {
      success: true,
      message: '사용자 정보가 업데이트되었습니다.',
      user: updatedUser,
    };
  }
}
