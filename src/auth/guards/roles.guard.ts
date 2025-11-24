import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { User } from '../entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // 역할 제한이 없으면 통과
    }

    const request = context.switchToHttp().getRequest<{ user: User }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('인증된 사용자가 아닙니다.');
    }

    // 역할 우선순위: ADMIN > SUB_ADMIN > PROJECT_MANAGER > USER
    const roleHierarchy: Record<Role, number> = {
      [Role.USER]: 1,
      [Role.PROJECT_MANAGER]: 2,
      [Role.SUB_ADMIN]: 3,
      [Role.ADMIN]: 4,
    };

    const userRoleLevel = roleHierarchy[user.role];
    const hasRequiredRole = requiredRoles.some(
      (role) => userRoleLevel >= roleHierarchy[role],
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException('이 작업을 수행할 권한이 없습니다.');
    }

    return true;
  }
}
