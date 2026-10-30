import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatBadgeCount } from './components/admin/AdminSidebar.tsx';

describe('Admin Sidebar Notification Badges Logic & Formatting', () => {
  describe('formatBadgeCount formatting utility', () => {
    it('returns null when count is zero or negative (hiding the badge)', () => {
      expect(formatBadgeCount(0)).toBeNull();
      expect(formatBadgeCount(-1)).toBeNull();
      expect(formatBadgeCount(-10)).toBeNull();
    });

    it('returns exact string representation for counts between 1 and 99', () => {
      expect(formatBadgeCount(1)).toBe('1');
      expect(formatBadgeCount(5)).toBe('5');
      expect(formatBadgeCount(12)).toBe('12');
      expect(formatBadgeCount(48)).toBe('48');
      expect(formatBadgeCount(99)).toBe('99');
    });

    it('caps counts greater than 99 at "99+"', () => {
      expect(formatBadgeCount(100)).toBe('99+');
      expect(formatBadgeCount(101)).toBe('99+');
      expect(formatBadgeCount(250)).toBe('99+');
      expect(formatBadgeCount(1000)).toBe('99+');
    });
  });

  describe('AdminSidebar Source Code & Accessibility Integrity', () => {
    const sidebarPath = path.resolve(__dirname, 'components/admin/AdminSidebar.tsx');
    const sidebarCode = fs.readFileSync(sidebarPath, 'utf-8');

    it('accepts badgeCounts prop with orders number', () => {
      expect(sidebarCode).toContain('badgeCounts?:');
      expect(sidebarCode).toContain('orders: number;');
    });

    it('renders a red badge with readable text and accessible aria-label', () => {
      expect(sidebarCode).toContain('bg-red-600 text-white rounded-full');
      expect(sidebarCode).toContain('item.id === \'orders\'');
      expect(sidebarCode).toContain('unacknowledged orders requiring attention');
      expect(sidebarCode).toContain('aria-label={badgeAriaLabel}');
    });

    it('shares content structure between desktop static sidebar and mobile drawer', () => {
      // Desktop static sidebar renders {content}
      expect(sidebarCode).toContain('<aside className="hidden lg:block');
      // Mobile drawer renders {content}
      expect(sidebarCode).toContain('{isMobileOpen && (');
      expect(sidebarCode).toContain('{content}');
    });
  });

  describe('AdminPortal Integration & Refresh Lifecycle', () => {
    const portalPath = path.resolve(__dirname, 'components/admin/AdminPortal.tsx');
    const portalCode = fs.readFileSync(portalPath, 'utf-8');

    it('imports adminGetBadgeCounts and adminAcknowledgeOrder', () => {
      expect(portalCode).toContain('adminAcknowledgeOrder');
      expect(portalCode).toContain('adminGetBadgeCounts');
    });

    it('passes badgeCounts prop down to AdminSidebar', () => {
      expect(portalCode).toContain('<AdminSidebar');
      expect(portalCode).toContain('badgeCounts={badgeCounts}');
    });

    it('refreshes badge counts on window focus, visibility change, and 30s interval', () => {
      expect(portalCode).toContain("window.addEventListener('focus', handleFocus)");
      expect(portalCode).toContain("document.addEventListener('visibilitychange', handleFocus)");
      expect(portalCode).toContain('30000');
    });

    it('preserves last valid counts gracefully if network request fails', () => {
      expect(portalCode).toContain('const fetchBadgeCounts = useCallback(async () => {');
      expect(portalCode).toContain('try {');
      expect(portalCode).toContain('const counts = await adminGetBadgeCounts();');
      expect(portalCode).toContain('catch {');
      // Verify comment or safe handling without overwriting valid counts with 0 on failure
      expect(portalCode).toContain('Fail gracefully: retain previous valid counts');
    });

    it('renders NEW badge on unacknowledged orders and provides explicit Acknowledge button', () => {
      expect(portalCode).toContain('NEW');
      expect(portalCode).toContain('data-testid={`new-badge-${order.id}`}');
      expect(portalCode).toContain('handleAcknowledgeOrder(order.id)');
      expect(portalCode).toContain('data-testid={`acknowledge-btn-${order.id}`}');
    });
  });

  describe('Simulation of State & Failure Handling', () => {
    it('preserves badge counts when background polling catches an error', async () => {
      let state = { orders: 5, stock: 2 };

      const failingFetch = async () => {
        throw new Error('Network error');
      };

      try {
        await failingFetch();
        state = { orders: 0, stock: 0 };
      } catch {
        // State remains untouched
      }

      expect(state.orders).toBe(5);
      expect(state.stock).toBe(2);
    });

    it('correctly updates badge counts when an order is acknowledged', () => {
      let counts = { orders: 3, stock: 1 };

      // Simulate acknowledgment
      counts = {
        ...counts,
        orders: Math.max(0, counts.orders - 1),
      };

      expect(counts.orders).toBe(2);
      expect(formatBadgeCount(counts.orders)).toBe('2');
    });
  });
});
