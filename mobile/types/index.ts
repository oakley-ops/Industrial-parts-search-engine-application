export interface SearchResult {
  vendorSlug: string; vendorName: string; partNumber: string;
  vendorSku: string; name: string; description: string;
  price: number | null; inStock: boolean; productUrl: string;
  imageUrl?: string;
}

export interface PriceResult {
  vendorSlug: string; vendorName: string; vendorSku: string;
  price: number | null; currency: string; quantityOnHand: number;
  source: 'VENDOR_WAREHOUSE' | 'MANUFACTURER_ORDER' | 'BACKORDER' | 'UNKNOWN';
  leadTimeDays: number | null; minOrderQty: number; unitOfMeasure: string;
  productUrl: string; inStock: boolean; scrapedAt: string; error?: string;
}

export interface Quote {
  id: string; title: string; status: string; notes?: string;
  lineItems: QuoteLineItem[]; createdAt: string; updatedAt: string;
}

export interface QuoteLineItem {
  id: string; partNumber: string; vendorSlug: string; vendorName: string;
  vendorSku?: string; description?: string; quantity: number;
  unitPrice: number; totalPrice: number; availability?: string;
  leadTimeDays?: number; productUrl?: string; snapshotAt: string;
}

export interface Alert {
  id: string; partNumber: string; vendorSlug?: string;
  alertType: 'price_below' | 'in_stock' | 'lead_time_above';
  thresholdValue?: number; notes?: string; isActive: boolean;
  lastTriggered?: string; createdAt: string;
}

export interface CrossrefSuggestion {
  partNumber: string;
  manufacturer: string;
  matchReason: string;
  keySpecs: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface CrossrefResult {
  suggestions: CrossrefSuggestion[];
  error?: string;
}
