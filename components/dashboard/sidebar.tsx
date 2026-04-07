'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Home,
  ShoppingCart,
  Briefcase,
  Users,
  Settings,
  LogOut,
  BarChart3,
  Award,
  DollarSign,
  Tag,
} from 'lucide-react';

type SidebarContentProps = {
  onNavigate?: () => void;
};

function DashboardNavContent({ onNavigate }: SidebarContentProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  const isActive = (href: string) => pathname === href;

  const customerLinks = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/dashboard/marketplace', label: 'Browse Services', icon: ShoppingCart },
    { href: '/dashboard/orders', label: 'My Orders', icon: Briefcase },
    { href: '/dashboard/topup', label: 'Top-up Center', icon: DollarSign },
    { href: '/dashboard/profile', label: 'My Account', icon: Users },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ];

  const sellerLinks = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/dashboard/tasks', label: 'Available Orders', icon: Award },
    { href: '/dashboard/earnings', label: 'Earnings & Stats', icon: BarChart3 },
    { href: '/dashboard/profile', label: 'Seller Profile', icon: Users },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ];

  const adminLinks = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/dashboard/games', label: 'Manage Games', icon: Award },
    { href: '/dashboard/admin/offers', label: 'Manage Offers', icon: Tag },
    { href: '/dashboard/admin/payment-methods', label: 'Payment Methods', icon: DollarSign },
    { href: '/dashboard/users', label: 'Manage Users', icon: Users },
    { href: '/dashboard/orders', label: 'All Orders', icon: ShoppingCart },
    { href: '/dashboard/topup', label: 'Top-up Requests', icon: DollarSign },
    { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/dashboard/finance', label: 'Finance', icon: DollarSign },
    { href: '/dashboard/settings', label: 'Admin Settings', icon: Settings },
  ];

  const links = user?.role === 'admin' ? adminLinks : user?.role === 'seller' ? sellerLinks : customerLinks;

  return (
    <>
      <div className="border-b border-gray-200 p-4 dark:border-gray-800 sm:p-6">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onNavigate}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-800">
            <span className="text-sm font-bold text-black dark:text-white">M</span>
          </div>
          <span className="text-base font-bold text-black dark:text-white sm:text-lg">MOHSTORE</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-2 p-3 sm:p-4">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} onClick={onNavigate}>
              <div
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors sm:text-base ${
                  isActive(link.href)
                    ? 'bg-gray-200 text-black dark:bg-gray-800 dark:text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-black dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-white'
                }`}
              >
                <Icon size={20} />
                <span>{link.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-gray-200 p-3 dark:border-gray-800 sm:p-4">
        <div className="rounded-lg bg-gray-100 px-4 py-3 dark:bg-[#020617]">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Logged in as</p>
          <p className="font-medium text-black dark:text-white">{user?.username}</p>
          <p className="text-xs capitalize text-gray-500 dark:text-gray-400">{user?.role}</p>
        </div>
        <Link href="/dashboard/settings" className="block" onClick={onNavigate}>
          <Button variant="outline" className="w-full justify-start gap-2">
            <Settings size={18} />
            Settings
          </Button>
        </Link>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-red-500 hover:bg-gray-100 hover:text-red-600 dark:border-gray-800 dark:text-red-400 dark:hover:bg-gray-900 dark:hover:text-red-300"
          onClick={() => {
            onNavigate?.();
            handleLogout();
          }}
        >
          <LogOut size={18} />
          Logout
        </Button>
      </div>
    </>
  );
}

export default function Sidebar() {
  return (
    <aside className="hidden w-64 border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:flex lg:flex-col">
      <DashboardNavContent />
    </aside>
  );
}

export { DashboardNavContent };
