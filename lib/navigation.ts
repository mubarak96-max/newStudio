export type DashboardNavItem = {
  key: string;
  name: string;
  route: string;
  icon: 'extraction';
};

/**
 * Side-nav items — Home is hardcoded in the Sidebar, everything else lives here.
 */
export const dashboardNavItems: DashboardNavItem[] = [];

/** Book-scoped nav shown in the sidebar on that book's pages. */
export function bookNavItems(bookId: string): DashboardNavItem[] {
  return [
    {
      key: 'book-extraction',
      name: 'Extraction',
      route: `/book/${bookId}/extraction`,
      icon: 'extraction',
    },
  ];
}
