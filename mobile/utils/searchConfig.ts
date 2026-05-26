export interface VendorConfig {
  slug: string;
  name: string;
}

export const ACTIVE_VENDORS: VendorConfig[] = [
  { slug: 'motion', name: 'Motion Industries' },
  { slug: 'digikey', name: 'DigiKey' },
  { slug: 'oemsecrets', name: 'OEM Secrets' },
  // { slug: 'grainger', name: 'Grainger' },
  // { slug: 'mcmaster', name: 'McMaster-Carr' },
];
