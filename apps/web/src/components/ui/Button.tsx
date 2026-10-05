import React, { forwardRef } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';

/**
 * Button system from the frontend spec (section 9):
 * primary (green/white), secondary (white/green border), destructive (red,
 * destructive actions only), emergency (visually distinct, red treatment).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'emergency';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
}

const baseStyles =
  'inline-flex items-center justify-center gap-2 font-medium rounded-pill transition-colors duration-150 select-none disabled:opacity-60 disabled:pointer-events-none';

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

const iconOnlySizeStyles: Record<ButtonSize, string> = {
  sm: 'p-1.5',
  md: 'p-2',
  lg: 'p-2.5',
};

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand-green text-white hover:bg-brand-green-dark focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2',
  secondary:
    'bg-white text-brand-green border border-brand-green hover:bg-brand-light-green focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2',
  ghost:
    'bg-transparent text-brand-text-secondary hover:bg-brand-light-green hover:text-brand-teal focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2',
  destructive:
    'bg-brand-soft-red text-red-700 border border-red-200 hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
  emergency:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2',
};

const spinnerSizes: Record<ButtonSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const iconSizes: Record<ButtonSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      leadingIcon: LeadingIcon,
      trailingIcon: TrailingIcon,
      className = '',
      children,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const iconOnly = !children && (LeadingIcon || TrailingIcon);
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={[
          baseStyles,
          sizeStyles[size],
          iconOnly ? iconOnlySizeStyles[size] : '',
          variantStyles[variant],
          fullWidth ? 'w-full' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {loading ? (
          <Loader2 className={`${spinnerSizes[size]} animate-spin`} aria-hidden="true" />
        ) : (
          <>
            {LeadingIcon && <LeadingIcon className={iconSizes[size]} aria-hidden="true" />}
            {children}
            {TrailingIcon && <TrailingIcon className={iconSizes[size]} aria-hidden="true" />}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
