export const THEME = {
  colors: {
    background: '#0f172a',
    surface: '#1e293b',
    surfaceElevated: '#334155',
    border: '#475569',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    accent: '#f97316',
    accentSubtle: '#431407',
    success: '#22c55e',
    successSubtle: '#052e16',
    danger: '#ef4444',
    dangerSubtle: '#2d0a0a',
    warning: '#f59e0b',
    warningSubtle: '#2d1a00',
    vendorMotion: '#f97316',
    vendorDigikey: '#3b82f6',
    vendorOemSecrets: '#10b981',
    vendorDefault: '#64748b',
    inputBg: '#1e293b',
    inputBorder: '#475569',
    placeholderText: '#64748b',
  },
  radius: {
    card: 4,
    button: 6,
    chip: 4,
    input: 4,
    badge: 4,
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
} as const;

export function vendorColor(slug: string): string {
  if (slug === 'motion') return THEME.colors.vendorMotion;
  if (slug === 'digikey') return THEME.colors.vendorDigikey;
  if (slug === 'oemsecrets') return THEME.colors.vendorOemSecrets;
  return THEME.colors.vendorDefault;
}
