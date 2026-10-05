import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'We hit an unexpected problem while loading this content. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-large border border-brand-border bg-brand-surface px-6 py-14 text-center animate-fade-in"
    >
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft-red text-red-600">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
      </span>
      <h3 className="text-h3 text-brand-teal">{title}</h3>
      {message && <p className="mt-2 max-w-sm text-small text-brand-text-secondary">{message}</p>}
      {onRetry && (
        <div className="mt-6">
          <Button variant="secondary" onClick={onRetry} leadingIcon={RefreshCw}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
