import React from 'react';
import { Menu, LogOut, ExternalLink } from 'lucide-react';
import { AdminUser } from '../../api/admin.ts';
import { AdminTab } from './AdminSidebar.tsx';
import { Button } from '../ui/button.tsx';
import { Badge } from '../ui/badge.tsx';

interface AdminHeaderProps {
  activeTab: AdminTab;
  currentUser: AdminUser | null;
  onOpenMobileNav: () => void;
  onLogout: () => void;
  onNavigateHome?: () => void;
}

const tabTitles: Record<AdminTab, string> = {
  metrics: 'Dashboard Metrics & Telemetry',
  products: 'Product Catalogue & Status',
  categories: 'Category Management & Storefront Routes',
  collections: 'Homepage Collections & Curated Showcase',
  stock: 'Inventory Reconciliation & Stock',
  orders: 'Customer Orders & Fulfillment',
  enquiries: 'Customer Enquiries & Drive Sync',
  audit: 'Security & Mutation Audit Trail',
  payments: 'Storefront Payment Settings & UPI QR',
};

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  activeTab,
  currentUser,
  onOpenMobileNav,
  onLogout,
  onNavigateHome,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-axdoro-surface/95 backdrop-blur-md border-b border-axdoro-border px-4 sm:px-6 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 rounded-lg text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-axdoro-text-muted font-mono font-medium">Portal</span>
            <span className="text-xs text-axdoro-border-strong">/</span>
            <h1 className="text-sm font-bold text-axdoro-charcoal tracking-tight">
              {tabTitles[activeTab]}
            </h1>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:flex items-center gap-2">
          <Badge variant="success" className="gap-1.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            <span>Active Session</span>
          </Badge>
          {currentUser && (
            <span className="text-xs text-axdoro-text-muted font-mono hidden md:inline">
              {currentUser.email}
            </span>
          )}
        </div>

        {onNavigateHome && (
          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateHome}
            className="hidden sm:inline-flex gap-1.5 border-axdoro-border text-axdoro-charcoal hover:bg-axdoro-bg focus-visible:ring-axdoro-accent cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-axdoro-accent-muted" />
            <span>Storefront</span>
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="gap-1.5 text-axdoro-text-muted hover:text-red-700 hover:bg-red-50 cursor-pointer focus-visible:ring-red-500"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
};
