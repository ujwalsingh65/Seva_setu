import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { HandHeart, Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon?: LucideIcon;
}

interface NavBarProps {
  items?: NavItem[];
  actions?: ReactNode;
}

export function NavBar({ items = [], actions }: NavBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-small font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green ${
      isActive
        ? 'bg-brand-mint text-brand-green-dark'
        : 'text-brand-text-secondary hover:bg-brand-light-green hover:text-brand-teal'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-brand-border bg-brand-surface/95 backdrop-blur">
      <div className="ds-page">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Link
              to="/"
              className="flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green rounded-small"
              aria-label="SevaSetu home"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-medium bg-brand-green text-white">
                <HandHeart className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-h3 text-brand-teal">SevaSetu</span>
            </Link>
            {items.length > 0 && (
              <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} className={linkClassName}>
                    {item.icon && <item.icon className="h-4 w-4" aria-hidden="true" />}
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>
          <div className="hidden items-center gap-3 md:flex">{actions}</div>
          <button
            type="button"
            className="rounded-small p-2 text-brand-text-secondary transition-colors hover:bg-brand-light-green hover:text-brand-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green md:hidden"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="border-t border-brand-border bg-brand-surface md:hidden">
          <div className="ds-page flex flex-col gap-1 py-3 animate-slide-up">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClassName} onClick={() => setMobileOpen(false)}>
                {item.icon && <item.icon className="h-4 w-4" aria-hidden="true" />}
                {item.label}
              </NavLink>
            ))}
            {actions && <div className="mt-2 flex flex-col gap-2 border-t border-brand-border pt-3">{actions}</div>}
          </div>
        </div>
      )}
    </header>
  );
}
