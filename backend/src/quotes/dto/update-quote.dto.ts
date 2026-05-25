import { IsOptional, IsString } from 'class-validator';

export class UpdateQuoteDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() notes?: string;
}
