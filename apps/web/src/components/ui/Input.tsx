import React, { forwardRef, useId } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { Label as UILabel } from './Typography';

/**
 * Input components from the frontend spec (section 10): 1px border,
 * 8-12px radius, 12-14px internal padding, visible focus state, clear
 * labels, helpful validation messages.
 */

const controlBase =
  'w-full rounded-small border bg-brand-surface text-small text-brand-text placeholder:text-brand-text-muted transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-brand-background disabled:text-brand-text-muted';

const controlState = {
  default:
    'border-brand-border hover:border-brand-text-muted focus:border-brand-green focus:ring-2 focus:ring-brand-green/25',
  error:
    'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/25',
};

export interface UseFormFieldProps {
  id?: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  hideLabel?: boolean;
}

export function useFormField({ id, label, hint, error, required, hideLabel }: UseFormFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy =
    [error ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null].filter(Boolean).join(' ') || undefined;
  return {
    fieldId,
    labelProps: {
      htmlFor: fieldId,
      required,
      className: hideLabel ? 'sr-only' : 'mb-1.5',
      children: label,
    },
    controlProps: {
      id: fieldId,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy,
      required,
    },
    message: error ? (
      <p id={`${fieldId}-error`} role="alert" className="mt-1.5 flex items-start gap-1 text-xs text-red-600">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {error}
      </p>
    ) : hint ? (
      <p id={`${fieldId}-hint`} className="mt-1.5 text-xs text-brand-text-muted">
        {hint}
      </p>
    ) : null,
  };
}

export interface FormFieldProps extends UseFormFieldProps {
  children: (controls: ReturnType<typeof useFormField>) => React.ReactNode;
}

/** Composable field wrapper when a control is built outside this module. */
export const FormField: React.FC<FormFieldProps> = ({ children, ...fieldProps }) => {
  const field = useFormField(fieldProps);
  return (
    <div className="w-full">
      {fieldProps.label && <UILabel {...field.labelProps} />}
      {children(field)}
      {field.message}
    </div>
  );
};

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, UseFormFieldProps {
  leadingIcon?: React.ReactNode;
  trailingAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, required, hideLabel, leadingIcon, trailingAddon, className = '', id, ...props }, ref) => {
    const field = useFormField({ id, label, hint, error, required, hideLabel });
    return (
      <div className="w-full">
        {label && <UILabel {...field.labelProps} />}
        <div className="relative">
          {leadingIcon && (
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-muted">
              {leadingIcon}
            </span>
          )}
          <input
            ref={ref}
            {...field.controlProps}
            {...props}
            className={[
              controlBase,
              error ? controlState.error : controlState.default,
              'px-3.5 py-3',
              leadingIcon ? 'pl-10' : '',
              trailingAddon ? 'pr-12' : '',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
          />
          {trailingAddon && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-text-muted">{trailingAddon}</span>
          )}
        </div>
        {field.message}
      </div>
    );
  }
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, UseFormFieldProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, required, hideLabel, className = '', id, rows = 4, ...props }, ref) => {
    const field = useFormField({ id, label, hint, error, required, hideLabel });
    return (
      <div className="w-full">
        {label && <UILabel {...field.labelProps} />}
        <textarea
          ref={ref}
          rows={rows}
          {...field.controlProps}
          {...props}
          className={[
            controlBase,
            error ? controlState.error : controlState.default,
            'px-3.5 py-3 resize-y',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        />
        {field.message}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement>, UseFormFieldProps {
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, required, hideLabel, options, placeholder, className = '', id, ...props }, ref) => {
    const field = useFormField({ id, label, hint, error, required, hideLabel });
    return (
      <div className="w-full">
        {label && <UILabel {...field.labelProps} />}
        <div className="relative">
          <select
            ref={ref}
            {...field.controlProps}
            {...props}
            className={[
              controlBase,
              error ? controlState.error : controlState.default,
              'appearance-none px-3.5 py-3 pr-10',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-text-muted" aria-hidden="true" />
        </div>
        {field.message}
      </div>
    );
  }
);
Select.displayName = 'Select';
