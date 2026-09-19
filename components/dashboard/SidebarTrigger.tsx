'use client';

import { useSidebar } from './SidebarContext';

export function SidebarTrigger() {
  const { isOpen, toggle } = useSidebar();

  return (
    <button
      type='button'
      onClick={toggle}
      aria-label={isOpen ? 'Hide navigation' : 'Show navigation'}
      aria-expanded={isOpen}
      aria-controls='dashboard-sidebar'
      className='relative flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background min-[1201px]:hidden'
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        width='20'
        height='20'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        aria-hidden='true'
      >
        <line x1='3' y1='6' x2='21' y2='6' />
        <line x1='3' y1='12' x2='21' y2='12' />
        <line x1='3' y1='18' x2='21' y2='18' />
      </svg>
    </button>
  );
}
