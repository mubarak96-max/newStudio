export type DashboardNavItem = {
  key: string;
  name: string;
  route: string;
  icon: 'extraction' | 'model' | 'story' | 'beats' | 'visuals' | 'images' | 'preview';
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
    {
      key: 'book-model',
      name: 'Book Model',
      route: `/book/${bookId}/model`,
      icon: 'model',
    },
    {
      key: 'book-story',
      name: 'Story',
      route: `/book/${bookId}/story`,
      icon: 'story',
    },
    {
      key: 'book-beats',
      name: 'Beats',
      route: `/book/${bookId}/beats`,
      icon: 'beats',
    },
    {
      key: 'book-visuals',
      name: 'Visuals',
      route: `/book/${bookId}/visuals`,
      icon: 'visuals',
    },
    {
      key: 'book-images',
      name: 'Images',
      route: `/book/${bookId}/images`,
      icon: 'images',
    },
    {
      key: 'book-preview',
      name: 'Preview',
      route: `/book/${bookId}/preview`,
      icon: 'preview',
    },
  ];
}
