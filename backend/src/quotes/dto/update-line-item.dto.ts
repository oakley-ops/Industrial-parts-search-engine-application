import { IsInt, Min } from 'class-validator';

export class UpdateLineItemDto {
  @IsInt() @Min(1) quantity: number;
}
