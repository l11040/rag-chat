import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '../../auth/enums/role.enum';

/**
 * 프로젝트 관리 권한을 체크하는 Guard
 * 서브 관리자(SUB_ADMIN) 또는 관리자(ADMIN)만 프로젝트 권한을 부여할 수 있음
 */
@Injectable()
export class ProjectAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // 서브 관리자 또는 관리자만 허용
    if (
      user.role === Role.SUB_ADMIN ||
      user.role === Role.ADMIN
    ) {
      return true;
    }

    throw new ForbiddenException(
      '프로젝트 권한을 관리하려면 서브 관리자 또는 관리자 권한이 필요합니다.',
    );
  }
}

