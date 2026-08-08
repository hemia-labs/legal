import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { BackchannelLogoutService } from '../services/backchannel-logout.service';

@Controller('v1/internal/auth')
export class BackchannelLogoutController {
  constructor(private readonly logout: BackchannelLogoutService) {}

  @Post('backchannel-logout')
  @HttpCode(204)
  async consume(@Body('logout_token') logoutToken: string) {
    await this.logout.consume(logoutToken);
  }
}
