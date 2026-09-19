'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

type SidebarContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

/** Viewport at/below which the sidebar collapses into a hidden drawer. */
const DRAWER_QUERY = '(max-width: 1200px)';

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);

  const open = React.useCallback(() => setIsOpen(true), []);
  const close = React.useCallback(() => setIsOpen(false), []);
  const toggle = React.useCallback(() => setIsOpen((value) => !value), []);

  // Collapse the drawer whenever the route changes.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets drawer state on navigation, ported from source
    setIsOpen(false);
  }, [pathname]);

  // Close on Escape while the drawer is open.
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Keep the drawer closed once the viewport grows past the breakpoint so the
  // static rail never inherits a stale "open" state.
  React.useEffect(() => {
    const query = window.matchMedia(DRAWER_QUERY);

    const syncViewport = () => {
      if (!query.matches) setIsOpen(false);
    };
    syncViewport();
    query.addEventListener('change', syncViewport);
    return () => query.removeEventListener('change', syncViewport);
  }, []);

  // Lock body scroll only while the drawer overlays content.
  React.useEffect(() => {
    if (!isOpen) return;
    if (!window.matchMedia(DRAWER_QUERY).matches) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const value = React.useMemo(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}
