import React from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Cards from the frontend spec (section 11): icon/image, title, short
 * description, metadata, primary action. Subcomponents compose that structure.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  hoverable = false,
  className = '',
  children,
  ...props
}) => (
  <div
    className={`bg-brand-surface rounded-medium border border-brand-border p-6 shadow-card ${
      hoverable ? 'transition-shadow duration-150 hover:shadow-card-hover' : ''
    } ${className}`}
    {...props}
  >
    {children}
  </div>
);

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  icon: Icon,
  action,
  className = '',
  children,
  ...props
}) => (
  <div className={`flex items-start justify-between gap-4 ${className}`} {...props}>
    <div className="flex items-start gap-3 min-w-0">
      {Icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-small bg-brand-mint text-brand-green">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}

export const CardTitle: React.FC<CardTitleProps> = ({ as: Tag = 'h3', className = '', children, ...props }) => (
  <Tag className={`text-h3 text-brand-teal truncate ${className}`} {...props}>
    {children}
  </Tag>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <p className={`text-small text-brand-text-secondary ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div className={`mt-3 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div className={`mt-4 flex items-center justify-between gap-3 border-t border-brand-border pt-4 ${className}`} {...props}>
    {children}
  </div>
);
