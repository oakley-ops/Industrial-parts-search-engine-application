import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateQuoteDto {
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() notes?: string;
}
