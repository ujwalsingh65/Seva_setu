export type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

export function Spinner({ size = 'md', className = 'border-brand-green border-t-transparent', label = 'Loading' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block animate-spin rounded-full ${sizeStyles[size]} ${className}`}
    />
  );
}

interface PageLoaderProps {
  label?: string;
}

export function PageLoader({ label = 'Loading' }: PageLoaderProps) {
  return (
    <div className="flex min-h-[16rem] w-full flex-col items-center justify-center gap-3" role="status" aria-label={label}>
      <Spinner size="lg" />
      <p className="text-small text-brand-text-muted">{label}…</p>
    </div>
  );
}
