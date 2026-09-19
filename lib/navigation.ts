export type DashboardNavItem = {
  key: string;
  name: string;
  route: string;
  icon: 'extraction';
};

/**
 * Side-nav items — Home is hardcoded in the Sidebar, everything else lives here.
 */
export const dashboardNavItems: DashboardNavItem[] = [
  { key: 'extraction', name: 'Extraction', route: '/extraction', icon: 'extraction' },
];
