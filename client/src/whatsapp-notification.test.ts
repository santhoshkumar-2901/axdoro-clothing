import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeWhatsAppPhone,
  getOrderWhatsAppNotification,
} from './utils/whatsapp.ts';

describe('Admin Order Status WhatsApp Notifications Utility', () => {
  describe('Phone Number Normalization for WhatsApp Click-to-Chat', () => {
    it('normalizes standard 10-digit Indian mobile numbers by prepending country code 91', () => {
      const res = normalizeWhatsAppPhone('9876543210');
      expect(res.isValid).toBe(true);
      expect(res.normalizedNumber).toBe('919876543210');
    });

    it('handles 10-digit Indian numbers formatted with spaces or hyphens', () => {
      const resSpaces = normalizeWhatsAppPhone('98765 43210');
      expect(resSpaces.isValid).toBe(true);
      expect(resSpaces.normalizedNumber).toBe('919876543210');

      const resHyphens = normalizeWhatsAppPhone('98765-43210');
      expect(resHyphens.isValid).toBe(true);
      expect(resHyphens.normalizedNumber).toBe('919876543210');
    });

    it('strips leading trunk prefix "0" from 11-digit Indian numbers and prepends 91', () => {
      const res = normalizeWhatsAppPhone('09876543210');
      expect(res.isValid).toBe(true);
      expect(res.normalizedNumber).toBe('919876543210');
    });

    it('does not duplicate country code if 12-digit number already starts with 91', () => {
      const res = normalizeWhatsAppPhone('919876543210');
      expect(res.isValid).toBe(true);
      expect(res.normalizedNumber).toBe('919876543210');
    });

    it('handles numbers with leading "+" and country code 91', () => {
      const res = normalizeWhatsAppPhone('+919876543210');
      expect(res.isValid).toBe(true);
      expect(res.normalizedNumber).toBe('919876543210');

      const resFormatted = normalizeWhatsAppPhone('+91 98765 43210');
      expect(resFormatted.isValid).toBe(true);
      expect(resFormatted.normalizedNumber).toBe('919876543210');
    });

    it('supports international numbers with explicit leading "+"', () => {
      // US (+1)
      const resUS = normalizeWhatsAppPhone('+14155552671');
      expect(resUS.isValid).toBe(true);
      expect(resUS.normalizedNumber).toBe('14155552671');

      // UK (+44)
      const resUK = normalizeWhatsAppPhone('+44 7911 123456');
      expect(resUK.isValid).toBe(true);
      expect(resUK.normalizedNumber).toBe('447911123456');

      // Singapore (+65)
      const resSG = normalizeWhatsAppPhone('+65-8123-4567');
      expect(resSG.isValid).toBe(true);
      expect(resSG.normalizedNumber).toBe('6581234567');
    });

    it('rejects ambiguous numbers without explicit "+" if they do not match Indian patterns', () => {
      // 11 digits not starting with 0
      const res11 = normalizeWhatsAppPhone('14155552671');
      expect(res11.isValid).toBe(false);
      expect(res11.error).toContain('Ambiguous country code');

      // 13 digits without leading '+'
      const res13 = normalizeWhatsAppPhone('4479111234567');
      expect(res13.isValid).toBe(false);
      expect(res13.error).toContain('Ambiguous country code');
    });

    it('rejects missing, empty, or whitespace-only phone inputs safely', () => {
      expect(normalizeWhatsAppPhone('')).toEqual({
        isValid: false,
        normalizedNumber: '',
        error: 'Customer phone number is missing',
      });
      expect(normalizeWhatsAppPhone('   ')).toEqual({
        isValid: false,
        normalizedNumber: '',
        error: 'Customer phone number is missing',
      });
      expect(normalizeWhatsAppPhone(null)).toEqual({
        isValid: false,
        normalizedNumber: '',
        error: 'Customer phone number is missing',
      });
      expect(normalizeWhatsAppPhone(undefined)).toEqual({
        isValid: false,
        normalizedNumber: '',
        error: 'Customer phone number is missing',
      });
    });

    it('rejects inputs containing illegal characters (letters, symbols)', () => {
      const resLetters = normalizeWhatsAppPhone('98765abc10');
      expect(resLetters.isValid).toBe(false);
      expect(resLetters.error).toContain('invalid characters');

      const resSymbols = normalizeWhatsAppPhone('98765#43210');
      expect(resSymbols.isValid).toBe(false);
      expect(resSymbols.error).toContain('invalid characters');
    });

    it('rejects numbers with mispositioned or multiple "+" signs', () => {
      const resMidPlus = normalizeWhatsAppPhone('987+6543210');
      expect(resMidPlus.isValid).toBe(false);

      const resDoublePlus = normalizeWhatsAppPhone('++919876543210');
      expect(resDoublePlus.isValid).toBe(false);
    });

    it('rejects phone numbers with fewer than 10 or more than 15 digits', () => {
      const resTooShort = normalizeWhatsAppPhone('987654321'); // 9 digits
      expect(resTooShort.isValid).toBe(false);
      expect(resTooShort.error).toContain('at least 10 digits');

      const resTooLong = normalizeWhatsAppPhone('+1234567890123456'); // 16 digits
      expect(resTooLong.isValid).toBe(false);
      expect(resTooLong.error).toContain('cannot exceed 15 digits');
    });
  });

  describe('Order WhatsApp Notification Generation & Status Messages', () => {
    const baseOrder = {
      orderNumber: 'AXD-20261021-9B3E2F',
      customerName: 'Aravind Raman',
      customerPhone: '9876543210',
    };

    it('disables notifications for PENDING status with an explanatory tooltip', () => {
      const res = getOrderWhatsAppNotification({
        ...baseOrder,
        orderStatus: 'PENDING',
      });
      expect(res.isEligible).toBe(false);
      expect(res.url).toBe('');
      expect(res.tooltip).toContain('Order must be confirmed before sending status notifications');
    });

    it('generates correct CONFIRMED notification message and click-to-chat URL', () => {
      const res = getOrderWhatsAppNotification({
        ...baseOrder,
        orderStatus: 'CONFIRMED',
      });
      expect(res.isEligible).toBe(true);
      expect(res.message).toBe(
        'Hi Aravind Raman, your AXDORO order #AXD-20261021-9B3E2F has been confirmed. Thank you for shopping with us!'
      );
      expect(res.url).toBe(
        `https://wa.me/919876543210?text=${encodeURIComponent(res.message)}`
      );
      expect(res.tooltip).toBe('Notify Aravind Raman on WhatsApp (CONFIRMED)');
    });

    it('generates correct PROCESSING notification message and click-to-chat URL', () => {
      const res = getOrderWhatsAppNotification({
        ...baseOrder,
        orderStatus: 'PROCESSING',
      });
      expect(res.isEligible).toBe(true);
      expect(res.message).toBe(
        "Hi Aravind Raman, your AXDORO order #AXD-20261021-9B3E2F is now being processed. We'll keep you updated."
      );
      expect(res.url).toBe(
        `https://wa.me/919876543210?text=${encodeURIComponent(res.message)}`
      );
      expect(res.tooltip).toBe('Notify Aravind Raman on WhatsApp (PROCESSING)');
    });

    it('generates correct SHIPPED notification message and omits non-existent tracking details', () => {
      const res = getOrderWhatsAppNotification({
        ...baseOrder,
        orderStatus: 'SHIPPED',
      });
      expect(res.isEligible).toBe(true);
      expect(res.message).toBe(
        'Hi Aravind Raman, your AXDORO order #AXD-20261021-9B3E2F has been shipped. Thank you for choosing AXDORO!'
      );
      // Ensures no fabricated tracking numbers or delivery estimates appear
      expect(res.message).not.toContain('Tracking');
      expect(res.message).not.toContain('AWB');
      expect(res.url).toBe(
        `https://wa.me/919876543210?text=${encodeURIComponent(res.message)}`
      );
      expect(res.tooltip).toBe('Notify Aravind Raman on WhatsApp (SHIPPED)');
    });

    it('generates correct DELIVERED notification message and click-to-chat URL', () => {
      const res = getOrderWhatsAppNotification({
        ...baseOrder,
        orderStatus: 'DELIVERED',
      });
      expect(res.isEligible).toBe(true);
      expect(res.message).toBe(
        'Hi Aravind Raman, your AXDORO order #AXD-20261021-9B3E2F has been delivered. Thank you for choosing AXDORO!'
      );
      expect(res.url).toBe(
        `https://wa.me/919876543210?text=${encodeURIComponent(res.message)}`
      );
      expect(res.tooltip).toBe('Notify Aravind Raman on WhatsApp (DELIVERED)');
    });

    it('generates correct CANCELLED notification message and click-to-chat URL', () => {
      const res = getOrderWhatsAppNotification({
        ...baseOrder,
        orderStatus: 'CANCELLED',
      });
      expect(res.isEligible).toBe(true);
      expect(res.message).toBe(
        'Hi Aravind Raman, your AXDORO order #AXD-20261021-9B3E2F has been cancelled. Please contact us if you have any questions.'
      );
      expect(res.url).toBe(
        `https://wa.me/919876543210?text=${encodeURIComponent(res.message)}`
      );
      expect(res.tooltip).toBe('Notify Aravind Raman on WhatsApp (CANCELLED)');
    });

    it('handles customer names with special characters and punctuation through URL encoding', () => {
      const res = getOrderWhatsAppNotification({
        orderNumber: 'AXD-20261021-SP1',
        customerName: "D'Souza & Sons",
        customerPhone: '+919876543210',
        orderStatus: 'CONFIRMED',
      });
      expect(res.isEligible).toBe(true);
      expect(res.url).toContain('https://wa.me/919876543210?text=');
      // Decoded text matches exact template
      const urlTextParam = new URL(res.url).searchParams.get('text');
      expect(urlTextParam).toBe(
        "Hi D'Souza & Sons, your AXDORO order #AXD-20261021-SP1 has been confirmed. Thank you for shopping with us!"
      );
    });

    it('falls back to "Customer" if customer name is missing', () => {
      const res = getOrderWhatsAppNotification({
        orderNumber: 'AXD-20261021-NONAME',
        customerName: null,
        customerPhone: '9876543210',
        orderStatus: 'PROCESSING',
      });
      expect(res.isEligible).toBe(true);
      expect(res.message).toContain('Hi Customer, your AXDORO order #AXD-20261021-NONAME');
    });

    it('disables notification when customer phone number is invalid', () => {
      const res = getOrderWhatsAppNotification({
        ...baseOrder,
        customerPhone: '12345', // invalid short
        orderStatus: 'CONFIRMED',
      });
      expect(res.isEligible).toBe(false);
      expect(res.url).toBe('');
      expect(res.tooltip).toContain('at least 10 digits');
    });
  });

  describe('Admin Portal Component Integration Inspection', () => {
    it('verifies AdminPortal.tsx renders the WhatsApp notification action alongside the order status control', () => {
      const adminPortalPath = path.resolve(__dirname, 'components/admin/AdminPortal.tsx');
      const content = fs.readFileSync(adminPortalPath, 'utf-8');

      // Verifies import of notification utility and icon
      expect(content).toContain("import { getOrderWhatsAppNotification } from '../../utils/whatsapp.ts';");
      expect(content).toContain('MessageSquare');

      // Verifies handler does not change order status or make API calls
      expect(content).toContain('handleNotifyCustomerWhatsApp');
      expect(content).toContain("window.open(notification.url, '_blank', 'noopener,noreferrer')");
      expect(content).not.toContain('adminUpdateOrderStatus(order.id'); // handleNotifyCustomerWhatsApp must not call update status

      // Verifies accessible attributes and click propagation prevention
      expect(content).toContain('e.stopPropagation()');
      expect(content).toContain('disabled={!notification.isEligible}');
      expect(content).toContain('title={notification.tooltip}');
      expect(content).toContain('aria-label={`Notify ${order.customerName} on WhatsApp for order ${order.orderNumber}`}');
    });
  });
});
