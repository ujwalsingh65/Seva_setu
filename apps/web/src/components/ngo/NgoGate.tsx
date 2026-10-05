import type { ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { useMyNgo } from '../../hooks/useApi';
import type { NgoMembership } from '../../services/api/endpoints';
import { Alert, EmptyState, ErrorState, Skeleton, SkeletonCard } from '../ui';

interface NgoGateProps {
  children: (ngo: NgoMembership, memberships: NgoMembership[]) => ReactNode;
}

/**
 * Resolves the signed-in user's NGO context before rendering NGO pages.
 * Loading, error, and no-membership states are handled here so every NGO
 * page can assume a valid organization.
 */
export function NgoGate({ children }: NgoGateProps) {
  const { memberships, primaryNgo, loading, error, refetch } = useMyNgo();

  if (loading) {
    return (
      <div>
        <Skeleton variant="text" className="mb-2 h-8 w-72" />
        <Skeleton variant="text" className="mb-6 h-4 w-96" />
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error?.message} onRetry={refetch} />;
  }

  if (!primaryNgo) {
    return (
      <EmptyState
        icon={Building2}
        title="No organization linked yet"
        description="Your account isn't affiliated with an NGO. Organization memberships are provisioned by the SevaSetu team — contact support to be added to your organization."
      />
    );
  }

  return (
    <>
      {memberships.length > 1 && (
        <Alert variant="info" className="mb-6">
          You're affiliated with {memberships.length} organizations. Showing {primaryNgo.ngo.name}.
        </Alert>
      )}
      {children(primaryNgo, memberships)}
    </>
  );
}
