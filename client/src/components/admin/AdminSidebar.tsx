import React from 'react';
import {
  BarChart3,
  Package,
  FolderTree,
  Sparkles,
  ShoppingBag,
  Inbox,
  History,
  ShieldCheck,
  ExternalLink,
  LogOut,
  X,
  QrCode,
} from 'lucide-react';
import { AdminUser } from '../../api/admin.ts';
import { Badge } from '../ui/badge.tsx';
import { useScrollLock } from '../../utils/scrollLock.ts';

export type AdminTab = 'metrics' | 'products' | 'categories' | 'collections' | 'orders' | 'enquiries' | 'audit' | 'payments';

export interface AdminSidebarProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  currentUser: AdminUser | null;
  onLogout: () => void;
  onNavigateHome?: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  badgeCounts?: {
    orders: number;
    stock?: number;
  };
}

export function formatBadgeCount(count: number): string | null {
  if (!count || count <= 0) return null;
  if (count > 99) return '99+';
  return String(count);
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  onSelectTab,
  currentUser,
  onLogout,
  onNavigateHome,
  isMobileOpen,
  onCloseMobile,
  badgeCounts,
}) => {
  // Global reference-counted scroll lock while mobile admin drawer is open
  useScrollLock(isMobileOpen);

  const navItems: { id: AdminTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'metrics', label: 'Dashboard Metrics', icon: BarChart3 },
    { id: 'products', label: 'Inventory', icon: Package },
    { id: 'categories', label: 'Categories', icon: FolderTree },
    { id: 'collections', label: 'Homepage Content', icon: Sparkles },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'enquiries', label: 'Enquiries & Drive Sync', icon: Inbox },
    { id: 'audit', label: 'Security Audit Logs', icon: History },
    { id: 'payments', label: 'Payment Settings', icon: QrCode },
  ];

  const content = (
    <div className="h-full flex flex-col justify-between bg-axdoro-surface border-r border-axdoro-border">
      {/* Top Header / Brand */}
      <div>
        <div className="p-5 border-b border-axdoro-border flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <img
                src="/logo-dark.png"
                alt="AXDORO"
                width={128}
                height={32}
                className="h-6 w-auto object-contain"
              />
              <span className="text-[10px] text-axdoro-text-muted font-mono tracking-wider font-semibold">PORTAL</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-axdoro-accent-muted font-semibold">
              <ShieldCheck className="w-3 h-3" />
              <span>Restricted Admin</span>
            </div>
          </div>
          {isMobileOpen && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-lg text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="px-4 pt-4 pb-2">
          <Badge variant="secondary" className="w-full justify-center py-1 bg-axdoro-surface-muted text-axdoro-charcoal font-semibold border-axdoro-border">
            Protected Administration Console
          </Badge>
        </div>

        {/* Navigation list */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const count = item.id === 'orders' ? badgeCounts?.orders ?? 0 : 0;
            const formattedBadge = formatBadgeCount(count);
            const badgeAriaLabel =
              item.id === 'orders'
                ? `${count} unacknowledged orders requiring attention`
                : undefined;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                  isActive
                    ? 'bg-axdoro-charcoal text-white shadow-subtle'
                    : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-surface-muted'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-axdoro-accent' : 'text-axdoro-text-muted'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {formattedBadge && (
                  <span
                    className="ml-auto inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none bg-red-600 text-white rounded-full shadow-sm min-w-[18px] shrink-0"
                    aria-label={badgeAriaLabel}
                    data-testid={`badge-${item.id}`}
                  >
                    {formattedBadge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User / Footer */}
      <div className="p-4 border-t border-axdoro-border bg-axdoro-surface-muted/40 space-y-3">
        {currentUser && (
          <div className="flex items-center gap-3 px-1">
            <div className="w-8 h-8 rounded-full bg-axdoro-accent-subtle border border-axdoro-accent/20 flex items-center justify-center font-bold text-xs text-axdoro-accent-muted flex-shrink-0">
              {currentUser.fullName ? currentUser.fullName[0].toUpperCase() : 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-axdoro-charcoal truncate">{currentUser.fullName}</p>
              <p className="text-[10px] text-axdoro-text-muted font-mono truncate">{currentUser.email}</p>
            </div>
          </div>
        )}

        <div className="space-y-1 pt-1">
          {onNavigateHome && (
            <button
              onClick={() => {
                onNavigateHome();
                onCloseMobile();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-surface-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              <ExternalLink className="w-3.5 h-3.5 text-axdoro-accent-muted" />
              <span>Back to Storefront</span>
            </button>
          )}

          <button
            onClick={() => {
              onLogout();
              onCloseMobile();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-700 hover:text-red-800 hover:bg-red-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop static sidebar */}
      <aside className="hidden lg:block w-64 h-screen sticky top-0 flex-shrink-0">
        {content}
      </aside>

      {/* Mobile drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
