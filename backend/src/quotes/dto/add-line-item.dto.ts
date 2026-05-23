import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AddLineItemDto {
  @IsString() @IsNotEmpty() partNumber: string;
  @IsString() @IsNotEmpty() vendorSlug: string;
  @IsString() @IsNotEmpty() vendorName: string;
  @IsOptional() @IsString() vendorSku?: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(1) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsString() availability?: string;
  @IsOptional() @IsNumber() @Min(0) leadTimeDays?: number;
  @IsOptional() @IsString() productUrl?: string;
}
