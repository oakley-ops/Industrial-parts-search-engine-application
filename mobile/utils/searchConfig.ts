export interface VendorConfig {
  slug: string;
  name: string;
}

export const ACTIVE_VENDORS: VendorConfig[] = [
  { slug: 'motion', name: 'Motion Industries' },
  // { slug: 'grainger', name: 'Grainger' },
  // { slug: 'mcmaster', name: 'McMaster-Carr' },
];
