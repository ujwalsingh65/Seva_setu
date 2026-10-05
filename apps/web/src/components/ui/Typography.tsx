import React from 'react';

/**
 * Typography scale from the frontend spec (section 5):
 * H1 32-48/700, H2 24-32/700, H3 18-22/600, Body 14-16/400, Small 12-14.
 * Headings render in dark teal per the reference design.
 */

export type HeadingLevel = 1 | 2 | 3;

const headingTags: Record<HeadingLevel, keyof React.JSX.IntrinsicElements> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
};

const headingSizes: Record<HeadingLevel, string> = {
  1: 'text-h1',
  2: 'text-h2',
  3: 'text-h3',
};

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: HeadingLevel;
  /** Render a different element (e.g. 'div') while keeping the visual scale. */
  as?: keyof React.JSX.IntrinsicElements;
}

export const Heading: React.FC<HeadingProps> = ({
  level = 2,
  as,
  className = '',
  children,
  ...props
}) => {
  const Tag = (as ?? headingTags[level]) as React.ElementType;
  return (
    <Tag className={`${headingSizes[level]} text-brand-teal ${className}`} {...props}>
      {children}
    </Tag>
  );
};

export type TextTone = 'default' | 'secondary' | 'muted' | 'inverse';

const textTones: Record<TextTone, string> = {
  default: 'text-brand-text',
  secondary: 'text-brand-text-secondary',
  muted: 'text-brand-text-muted',
  inverse: 'text-white',
};

export interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  size?: 'body' | 'small';
  tone?: TextTone;
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
}

export const Text: React.FC<TextProps> = ({
  size = 'body',
  tone = 'secondary',
  weight = 'normal',
  className = '',
  children,
  ...props
}) => {
  const sizeClass = size === 'small' ? 'text-small' : 'text-body';
  const weightClass = weight === 'normal' ? '' : `font-${weight}`;
  return (
    <p className={`${sizeClass} ${textTones[tone]} ${weightClass} ${className}`} {...props}>
      {children}
    </p>
  );
};

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label: React.FC<LabelProps> = ({ required, className = '', children, ...props }) => (
  <label className={`block text-small font-medium text-brand-text ${className}`} {...props}>
    {children}
    {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
  </label>
);

export interface CaptionProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'secondary' | 'muted';
}

export const Caption: React.FC<CaptionProps> = ({ tone = 'muted', className = '', children, ...props }) => (
  <span className={`text-small ${tone === 'muted' ? 'text-brand-text-muted' : 'text-brand-text-secondary'} ${className}`} {...props}>
    {children}
  </span>
);
