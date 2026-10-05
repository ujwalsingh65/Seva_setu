/**
 * SevaSetu Design System Tokens
 * Source of Truth: Docs/seva setu frontend specifications.pdf (Sections 3-9)
 * and the SevaSetu reference design. Mirrors tailwind.config.js — keep both in
 * sync when the visual spec changes.
 */
import { BRAND_COLORS } from '@sevasetu/constants';

export const colors = BRAND_COLORS;

export type ColorToken = keyof typeof colors;

/** Documented spacing scale (px). Avoid arbitrary spacing unless necessary. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Typography scale (px ranges from the spec resolve to the clamp() midpoint). */
export const typography = {
  h1: { minSize: 32, maxSize: 48, weight: 700, lineHeight: 1.15 },
  h2: { minSize: 24, maxSize: 32, weight: 700, lineHeight: 1.25 },
  h3: { minSize: 18, maxSize: 22, weight: 600, lineHeight: 1.35 },
  body: { minSize: 14, maxSize: 16, weight: 400, lineHeight: 1.6 },
  small: { minSize: 12, maxSize: 14, weight: 400, lineHeight: 1.5 },
} as const;

export type TypographyToken = keyof typeof typography;

export const fontFamily =
  "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const radii = {
  small: 8,
  medium: 12,
  large: 16,
  xl: 24,
  pill: 9999,
} as const;

export const shadows = {
  card: '0 2px 10px rgba(6, 52, 59, 0.06)',
  cardHover: '0 6px 20px rgba(6, 52, 59, 0.10)',
} as const;

export const layout = {
  contentMaxWidth: 1280,
  pagePadding: { desktop: 32, tablet: 24, mobile: 16 },
} as const;

/**
 * Semantic status colors (spec section 12). Status is never color-only —
 * pair the tint with a visible text label (Badge does this).
 */
export const statusColors = {
  success: { background: colors.MINT, text: colors.DEEP_GREEN },
  warning: { background: colors.SOFT_ORANGE, text: '#8A5A00' },
  error: { background: colors.SOFT_RED, text: '#B42323' },
  info: { background: colors.SOFT_BLUE, text: '#1E5A73' },
  neutral: { background: '#EEF2F1', text: colors.TEXT_SECONDARY },
} as const;

export type StatusToken = keyof typeof statusColors;
