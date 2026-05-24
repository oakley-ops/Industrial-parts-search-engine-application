/**
 * Modern Industrial Design System
 * Dark-first aesthetic inspired by HMI panels and factory-floor displays.
 * Safety orange primary, steel blue accent, gunmetal structure.
 */

export const theme = {
  colors: {
    // ── Backgrounds ──────────────────────────────────────────
    background: '#0F1117',      // near-black app background
    surface: '#1A1F2E',         // card / modal surface
    surfaceElevated: '#232A3B', // raised inputs / headers
    surfaceDeep: '#0D1117',     // deepest layer

    // ── Borders ───────────────────────────────────────────────
    border: '#2D3748',          // standard gunmetal border
    borderSubtle: '#1E2D3D',    // very subtle divider
    borderHighlight: '#F97316', // orange active/selected border

    // ── Primary — Safety Orange ───────────────────────────────
    primary: '#F97316',
    primaryLight: '#FB923C',
    primaryDark: '#EA6C0A',
    primarySubtle: '#431407',   // bg tint behind orange text

    // ── Secondary — Steel Blue ────────────────────────────────
    secondary: '#38BDF8',
    secondaryDark: '#0EA5E9',
    secondarySubtle: '#0C2A3F', // bg tint behind blue text

    // ── Status ────────────────────────────────────────────────
    success: '#22C55E',
    successDark: '#16A34A',
    successSubtle: '#052E16',

    warning: '#EAB308',
    warningDark: '#CA8A04',
    warningSubtle: '#1C1A05',

    error: '#EF4444',
    errorDark: '#DC2626',
    errorSubtle: '#2D0A0A',

    // ── Text ──────────────────────────────────────────────────
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textDisabled: '#475569',

    // ── Misc ──────────────────────────────────────────────────
    white: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.6)',
  },

  radius: {
    xs: 2,
    sm: 4,
    md: 6,
    lg: 8,
    xl: 10,
    xxl: 12,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  typography: {
    heading: {
      fontWeight: '800' as const,
      letterSpacing: 0.5,
      color: '#F8FAFC',
    },
    subheading: {
      fontWeight: '700' as const,
      letterSpacing: 0.3,
      color: '#F8FAFC',
    },
    label: {
      fontWeight: '700' as const,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
      color: '#94A3B8',
    },
    body: {
      fontWeight: '400' as const,
      color: '#F8FAFC',
    },
    muted: {
      fontWeight: '400' as const,
      color: '#64748B',
    },
  },
} as const;

/** Re-usable card style fragment */
export const cardStyle = {
  backgroundColor: theme.colors.surface,
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: theme.radius.lg,
  padding: theme.spacing.lg,
  marginBottom: theme.spacing.md,
} as const;

/** Re-usable primary button */
export const primaryButtonStyle = {
  backgroundColor: theme.colors.primary,
  borderRadius: theme.radius.md,
  padding: theme.spacing.md,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
} as const;

/** Re-usable outlined secondary button */
export const outlinedButtonStyle = {
  borderWidth: 1.5,
  borderColor: theme.colors.secondary,
  borderRadius: theme.radius.md,
  padding: theme.spacing.md,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: 'transparent',
} as const;
