export type DashboardNavItem = {
  key: string;
  name: string;
  route: string;
  icon: 'battery' | 'inventory' | 'orders' | 'users' | 'shop' | 'receipt';
};

/**
 * Static side-nav items ported from 800MotorB2B (navigation.tsx).
 * Page components and role-gating (which pulled in firebase/auth pages)
 * are intentionally left out — labels + routes only.
 */
export const dashboardNavItems: DashboardNavItem[] = [
  { key: 'battery-shop', name: 'Battery Shop', route: '/dashboard/battery-shop', icon: 'battery' },
  { key: 'battery-inventory', name: 'Battery Inventory', route: '/dashboard/battery-inventory', icon: 'inventory' },
  { key: 'battery-orders', name: 'Order History', route: '/dashboard/orders', icon: 'orders' },
  { key: 'user-management', name: 'User Management', route: '/dashboard/user-management', icon: 'users' },
  { key: 'shop-profile', name: 'Shop Profile', route: '/dashboard/shop-profile', icon: 'shop' },
  { key: 'sold-batteries', name: 'Sold Batteries', route: '/dashboard/sold-batteries', icon: 'receipt' },
];
