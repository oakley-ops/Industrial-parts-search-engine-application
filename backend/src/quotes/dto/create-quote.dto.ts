export class CreateQuoteDto {
  partId: string;
  vendorId: string;
  price: number;
  quantity: number;
  notes?: string;
}
