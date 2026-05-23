import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum AlertType {
  PRICE_BELOW = 'price_below',
  IN_STOCK = 'in_stock',
  LEAD_TIME_ABOVE = 'lead_time_above',
}

export class CreateAlertDto {
  @IsString() @IsNotEmpty() partNumber: string;
  @IsOptional() @IsString() vendorSlug?: string;
  @IsEnum(AlertType) alertType: AlertType;
  @IsOptional() @IsNumber() @Min(0) thresholdValue?: number;
  @IsOptional() @IsString() notes?: string;
}
