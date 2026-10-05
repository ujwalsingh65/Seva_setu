export type SkeletonVariant = 'text' | 'circular' | 'rectangular';

interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
}

export function Skeleton({ variant = 'text', className = '' }: SkeletonProps) {
  const variantStyles: Record<SkeletonVariant, string> = {
    text: 'h-4 w-full rounded-pill',
    circular: 'h-10 w-10 rounded-full',
    rectangular: 'h-24 w-full rounded-medium',
  };

  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden bg-[#E7EEEC] ${variantStyles[variant]} ${className}`}
    >
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

interface SkeletonCardProps {
  lines?: number;
}

export function SkeletonCard({ lines = 3 }: SkeletonCardProps) {
  return (
    <div className="rounded-large border border-brand-border bg-brand-surface p-6 shadow-card">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" />
        <div className="flex-1 space-y-2">
          <Skeleton className="w-1/2" />
          <Skeleton className="w-1/3" />
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className={index === lines - 1 ? 'w-2/3' : 'w-full'} />
        ))}
      </div>
    </div>
  );
}
