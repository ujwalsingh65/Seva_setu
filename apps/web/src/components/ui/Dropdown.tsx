import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';

export type DropdownAlign = 'start' | 'end';

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: DropdownAlign;
  label?: string;
}

export function Dropdown({ trigger, children, align = 'end', label }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <div
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((value) => !value);
          }
        }}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </div>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute top-full z-40 mt-2 min-w-[12rem] rounded-medium border border-brand-border bg-brand-surface p-1.5 shadow-dropdown animate-slide-up ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  tone?: 'default' | 'danger';
}

export function DropdownItem({ icon: Icon, tone = 'default', className = '', children, ...props }: DropdownItemProps) {
  const toneStyles =
    tone === 'danger'
      ? 'text-red-700 hover:bg-brand-soft-red'
      : 'text-brand-text hover:bg-brand-light-green';
  return (
    <button
      type="button"
      role="menuitem"
      className={`flex w-full items-center gap-2.5 rounded-small px-3 py-2 text-left text-small font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green ${toneStyles} ${className}`}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="my-1.5 h-px bg-brand-border" role="separator" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-brand-text-muted">
      {children}
    </div>
  );
}
