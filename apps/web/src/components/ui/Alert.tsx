import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  onClose?: () => void;
  className?: string;
}

const variantStyles: Record<AlertVariant, { container: string; icon: string; Icon: LucideIcon }> = {
  info: {
    container: 'border-[#BFDCEE] bg-brand-soft-blue text-[#0E4A66]',
    icon: 'text-[#2273A3]',
    Icon: Info,
  },
  success: {
    container: 'border-[#BFE8D8] bg-brand-mint text-brand-green-dark',
    icon: 'text-brand-green',
    Icon: CheckCircle2,
  },
  warning: {
    container: 'border-[#F0DCB0] bg-brand-soft-orange text-[#7A4D0B]',
    icon: 'text-[#C07C10]',
    Icon: AlertTriangle,
  },
  error: {
    container: 'border-[#F2C7C7] bg-brand-soft-red text-red-800',
    icon: 'text-red-600',
    Icon: XCircle,
  },
};

export function Alert({ variant = 'info', title, children, onClose, className = '' }: AlertProps) {
  const { container, icon, Icon } = variantStyles[variant];

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-medium border p-4 ${container} ${className}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-small">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-1' : undefined}>{children}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss alert"
          className="-m-1 shrink-0 rounded-pill p-1 transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
