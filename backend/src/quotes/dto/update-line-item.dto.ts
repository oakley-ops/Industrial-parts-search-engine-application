import { IsInt, Min, IsOptional, IsNumber } from 'class-validator';

export class UpdateLineItemDto {
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
}
