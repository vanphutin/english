import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  Version,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { IdentityService, type AuthenticatedUser } from '@english/identity';
import type { Response } from 'express';
import { LoginDto } from './login.dto';
import { Public } from './public.decorator';
import type { AuthenticatedRequest } from './session-auth.guard';

@ApiTags('identity')
@Controller('auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}
  @Public()
  @Post('login')
  @Version('1')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in with the local account' })
  @ApiOkResponse({ description: 'Authenticated user' })
  @ApiUnauthorizedResponse()
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedUser> {
    const session = await this.identity.login(dto.username, dto.password);
    if (!session) throw new UnauthorizedException('Invalid username or password');
    response.cookie('english_session', session.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      expires: session.expiresAt,
      path: '/',
    });
    return session.user;
  }
  @Post('logout')
  @Version('1')
  @HttpCode(204)
  @ApiOperation({ summary: 'Invalidate the current local session' })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.identity.logout(request.cookies?.english_session as string | undefined);
    response.clearCookie('english_session', {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      path: '/',
    });
  }
  @Get('me')
  @Version('1')
  @ApiOperation({ summary: 'Get the authenticated local user' })
  me(@Req() request: AuthenticatedRequest): AuthenticatedUser {
    if (!request.user) throw new UnauthorizedException();
    return request.user;
  }
}
