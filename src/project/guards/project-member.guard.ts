import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectRole } from '../entities/project-member.entity';
import { PROJECT_ROLES_KEY } from '../decorators/project-roles.decorator';
import { ProjectService } from '../project.service';

@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private projectService: ProjectService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 필요한 프로젝트 역할 가져오기
    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(
      PROJECT_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 역할이 지정되지 않았으면 통과 (선택적 가드)
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('인증이 필요합니다.');
    }

    // 프로젝트 ID 가져오기 (파라미터, 쿼리, 바디에서)
    const projectId =
      request.params?.projectId ||
      request.body?.projectId ||
      request.query?.projectId;

    if (!projectId) {
      throw new ForbiddenException('프로젝트 ID가 필요합니다.');
    }

    // 사용자가 프로젝트 멤버인지 확인
    const member = await this.projectService.getProjectMember(
      projectId,
      user.id,
    );

    if (!member) {
      throw new ForbiddenException('프로젝트에 접근할 권한이 없습니다.');
    }

    // 역할 체크
    if (requiredRoles.length > 0 && !requiredRoles.includes(member.role)) {
      throw new ForbiddenException(
        `이 작업을 수행하려면 ${requiredRoles.join(' 또는 ')} 권한이 필요합니다.`,
      );
    }

    // request에 멤버 정보 추가 (컨트롤러에서 사용 가능)
    request.projectMember = member;

    return true;
  }
}

