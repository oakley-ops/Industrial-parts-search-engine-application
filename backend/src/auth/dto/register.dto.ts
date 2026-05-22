import { IsOptional, IsString } from 'class-validator';
import { LoginDto } from './login.dto';

export class RegisterDto extends LoginDto {
  @IsOptional() @IsString() name?: string;
}
