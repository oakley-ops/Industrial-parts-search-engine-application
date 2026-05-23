import { Controller, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Patch('push-token')
  updatePushToken(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdatePushTokenDto,
  ): Promise<void> {
    return this.usersService.updatePushToken(user.id, dto.token);
  }
}
