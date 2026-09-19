'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home } from 'lucide-react';
import {
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { dashboardNavItems, type DashboardNavItem } from '@/lib/navigation';
import { useSidebar } from './SidebarContext';

type SidebarProps = {
  className?: string;
  displayName?: string | null;
  roleLabel?: string | null;
};

const navIcons: Record<DashboardNavItem['icon'], LucideIcon> = {
  extraction: FileText,
};

function isActiveRoute(pathname: string | null, route: string) {
  return pathname === route || (pathname?.startsWith(`${route}/`) ?? false);
}

/** Sliding gradient pill that marks the active nav item (shared layoutId). */
function ActivePill() {
  return (
    <motion.div
      layoutId='dashboard-sidebar-active-pill'
      className='absolute inset-0 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/15 to-purple-500/10'
      initial={false}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    />
  );
}

const navLinkClasses = (isActive: boolean) =>
  [
    'relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
    isActive
      ? 'font-medium text-primary'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  ].join(' ');

export function Sidebar({
  className = '',
  displayName,
  roleLabel,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, close } = useSidebar();

  const isHomeActive = pathname === '/' || pathname === '/dashboard';
  const profileInitial = displayName?.trim().charAt(0).toUpperCase() || 'S';

  return (
    <>
      {/* Scrim behind the drawer (≤1200px only). */}
      <div
        aria-hidden='true'
        onClick={close}
        className={[
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 min-[1201px]:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      />

      <aside
        id='dashboard-sidebar'
        className={[
          // Drawer (≤1200px): fixed, off-canvas by default, slides in when open.
          'fixed top-0 left-0 z-50 h-full w-72 max-w-[85vw] border-r border-border/60 bg-background shadow-xl transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Static rail (>1200px): sticky in-flow, always visible.
          'min-[1201px]:sticky min-[1201px]:top-[73px] min-[1201px]:left-auto min-[1201px]:h-[calc(100vh-73px)] min-[1201px]:w-64 min-[1201px]:max-w-none min-[1201px]:shrink-0 min-[1201px]:translate-x-0 min-[1201px]:rounded-r-2xl min-[1201px]:bg-background/60 min-[1201px]:shadow-none min-[1201px]:backdrop-blur',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className='flex h-full flex-col'>
          <div className='p-4 pb-0'>
            <div className='mb-4 flex items-center justify-between px-2'>
              <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                Dashboard
              </p>
              <button
                type='button'
                onClick={close}
                aria-label='Hide navigation'
                className='flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background min-[1201px]:hidden'
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  width='18'
                  height='18'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  aria-hidden='true'
                >
                  <path d='M18 6 6 18' />
                  <path d='m6 6 12 12' />
                </svg>
              </button>
            </div>

            {/* Profile card (static — no auth viewer). */}
            <div className='mb-4 flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm'>
              <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-600 text-sm font-bold text-white shadow-lg'>
                {profileInitial}
              </div>
              <div className='min-w-0'>
                <p className='truncate text-sm font-medium text-foreground'>
                  {displayName || 'Partner'}
                </p>
                <p className='truncate text-xs text-primary'>
                  {roleLabel || 'Administrator'}
                </p>
              </div>
            </div>
          </div>

          <nav
            aria-label='Dashboard navigation'
            className='flex-1 space-y-1 overflow-y-auto p-4 pt-0'
          >
            <Link
              href='/'
              onClick={close}
              onMouseEnter={() => router.prefetch('/')}
              aria-current={isHomeActive ? 'page' : undefined}
              className='relative block rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background'
            >
              {isHomeActive && <ActivePill />}
              <div className={navLinkClasses(isHomeActive)}>
                <Home aria-hidden='true' className='h-[18px] w-[18px] shrink-0' />
                <span className='truncate'>Home</span>
              </div>
            </Link>

            {dashboardNavItems.map((item) => {
              const isActive = isActiveRoute(pathname, item.route);
              const Glyph = navIcons[item.icon];

              return (
                <Link
                  key={item.key}
                  href={item.route}
                  onClick={close}
                  onMouseEnter={() => router.prefetch(item.route)}
                  aria-current={isActive ? 'page' : undefined}
                  className='relative block rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background'
                >
                  {isActive && <ActivePill />}
                  <div className={navLinkClasses(isActive)}>
                    <Glyph
                      aria-hidden='true'
                      className='h-[18px] w-[18px] shrink-0'
                    />
                    <span className='truncate'>{item.name}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
