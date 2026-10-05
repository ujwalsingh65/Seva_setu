import type { ReactNode } from 'react';
import { useClerk } from '@clerk/react';
import { NavBar } from '../components/ui';
import type { NavItem } from '../components/ui';
import { Badge } from '../components/ui';
import { useAppUser } from '../hooks/useAppUser';

interface AppShellProps {
  navItems: NavItem[];
  children: ReactNode;
}

/**
 * Authenticated application frame: responsive NavBar (role-scoped items),
 * user role badge sourced from the backend, and a centered page container.
 * Role display is UX only — enforcement stays server-side.
 */
export function AppShell({ navItems, children }: AppShellProps) {
  const { signOut } = useClerk();
  const { user } = useAppUser();

  const actions = (
    <>
      {user && (
        <span className="hidden max-w-[220px] truncate text-small text-brand-text-secondary lg:inline">
          {user.email}
        </span>
      )}
      {user && (
        <Badge variant="success" size="sm">
          {user.role.replace(/_/g, ' ')}
        </Badge>
      )}
      <button
        type="button"
        onClick={() => signOut()}
        className="rounded-pill px-3 py-2 text-small font-medium text-brand-text-secondary transition-colors hover:bg-brand-light-green hover:text-brand-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green"
      >
        Sign out
      </button>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-brand-background">
      <NavBar items={navItems} actions={actions} />
      <main className="ds-page w-full flex-1 py-8">{children}</main>
    </div>
  );
}
