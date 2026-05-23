import { IsEnum } from 'class-validator';

export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export class UpdateStatusDto {
  @IsEnum(QuoteStatus) status: QuoteStatus;
}
