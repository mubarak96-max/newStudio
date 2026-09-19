import type { ReactNode } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Sidebar } from './Sidebar';
import { SidebarProvider } from './SidebarContext';
import { SidebarTrigger } from './SidebarTrigger';
import { PageTransition } from './PageTransition';

type DashboardFrameProps = {
  children: ReactNode;
  companyName?: string;
  showSidebar?: boolean;
  displayName?: string | null;
  roleLabel?: string | null;
};

/**
 * Dashboard shell ported from 800MotorB2B (DashboardFrame) with
 * firebase/auth/redux stripped out: no viewer loading, no ShopSwitcher,
 * no LogoutButton, no pending-financials banner. Static props only.
 */
export function DashboardFrame({
  children,
  companyName = 'Partner',
  showSidebar = true,
  displayName,
  roleLabel,
}: DashboardFrameProps) {
  const content = (
    <>
      <header className='sticky top-0 z-30 flex h-[73px] items-center justify-between gap-2 border-b border-border/60 bg-background/60 px-3 backdrop-blur sm:px-6'>
        <div className='flex min-w-0 flex-1 items-center gap-2 sm:gap-3'>
          {showSidebar && <SidebarTrigger />}
          <Link
            href='/'
            aria-label='Go to home page'
            className='min-w-0 rounded-md transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background'>
            <p className='truncate text-xs uppercase tracking-wider text-muted-foreground'>
              Sayara Partner Portal
            </p>
            <h1 className='truncate text-base font-semibold sm:text-lg'>
              {companyName}
            </h1>
          </Link>
        </div>
        <div className='flex flex-shrink-0 items-center gap-1 sm:gap-2'>
          <ThemeToggle />
        </div>
      </header>

      <div
        className={
          showSidebar
            ? 'relative flex flex-1 flex-col min-[1201px]:flex-row'
            : 'relative flex-1'
        }>
        {showSidebar && (
          <Sidebar displayName={displayName} roleLabel={roleLabel} />
        )}
        <main
          className={
            showSidebar
              ? 'w-full flex-1 px-5 py-8 lg:px-8'
              : 'mx-auto w-full max-w-5xl px-6 py-10'
          }>
          {showSidebar ? (
            <div className='mx-auto max-w-7xl'>
              <PageTransition>{children}</PageTransition>
            </div>
          ) : (
            <PageTransition>{children}</PageTransition>
          )}
        </main>
      </div>
    </>
  );

  return (
    <div className='dashboard-backdrop relative flex min-h-screen flex-col bg-background text-foreground transition-colors duration-300'>
      {showSidebar ? <SidebarProvider>{content}</SidebarProvider> : content}
    </div>
  );
}
