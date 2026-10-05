import { Badge } from '../ui';
import type { BadgeVariant } from '../ui';
import { EVENT_STATUSES, APPLICATION_STATUSES } from '@sevasetu/constants';

const EVENT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  [EVENT_STATUSES.DRAFT]: 'neutral',
  [EVENT_STATUSES.PUBLISHED]: 'success',
  [EVENT_STATUSES.IN_PROGRESS]: 'info',
  [EVENT_STATUSES.COMPLETED]: 'neutral',
  [EVENT_STATUSES.CANCELLED]: 'error',
};

const APPLICATION_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  [APPLICATION_STATUSES.INTERESTED]: 'info',
  [APPLICATION_STATUSES.ACCEPTED]: 'success',
  [APPLICATION_STATUSES.WAITLISTED]: 'warning',
  [APPLICATION_STATUSES.REJECTED]: 'error',
  [APPLICATION_STATUSES.CANCELLED]: 'neutral',
};

interface StatusBadgeProps {
  kind: 'event' | 'application';
  status: string;
}

export function StatusBadge({ kind, status }: StatusBadgeProps) {
  const variants = kind === 'event' ? EVENT_STATUS_VARIANTS : APPLICATION_STATUS_VARIANTS;
  const label = status.replace(/_/g, ' ');
  return (
    <Badge variant={variants[status] ?? 'neutral'} size="sm" dot>
      {label}
    </Badge>
  );
}
