import React from 'react';

/**
 * Status badges from the frontend spec (section 12). Status is never
 * communicated by color alone — every badge renders a visible text label.
 */
export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Leading status dot — supplementary to the text label, never a replacement. */
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-brand-mint text-brand-green-dark border-brand-green/20',
  warning: 'bg-brand-soft-orange text-amber-800 border-amber-300',
  error: 'bg-brand-soft-red text-red-800 border-red-200',
  info: 'bg-brand-soft-blue text-cyan-900 border-cyan-200',
  neutral: 'bg-[#EEF2F1] text-brand-text-secondary border-brand-border',
};

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-brand-green',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-sky-600',
  neutral: 'bg-brand-text-muted',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-0.5 text-xs',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'info',
  size = 'md',
  dot = false,
  className = '',
  children,
  ...props
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-pill border font-medium ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    {...props}
  >
    {dot && <span className={`h-1.5 w-1.5 rounded-pill ${dotColors[variant]}`} aria-hidden="true" />}
    {children}
  </span>
);
