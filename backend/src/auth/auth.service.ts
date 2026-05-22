import { Injectable } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  login(loginDto: LoginDto) {
    return { access_token: '' };
  }

  register(loginDto: LoginDto) {
    return { access_token: '' };
  }
}
