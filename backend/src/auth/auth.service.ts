import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private users: UsersService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !(await this.users.validatePassword(user, password)))
      throw new UnauthorizedException('Invalid credentials');
    return {
      access_token: this.jwt.sign({ sub: user.id, email: user.email }),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async register(email: string, password: string, name?: string) {
    if (await this.users.findByEmail(email))
      throw new ConflictException('Email already registered');
    const user = await this.users.create(email, password, name);
    return {
      access_token: this.jwt.sign({ sub: user.id, email: user.email }),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}
