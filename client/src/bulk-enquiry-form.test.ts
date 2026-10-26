import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Product } from './types/product.ts';

describe('Bulk Enquiry Modal — Empty Form Values, Placeholders & Quantity Validation', () => {
  const clientDir = path.resolve(__dirname);
  const modalPath = path.join(clientDir, 'components', 'BulkEnquiryModal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf-8');

  const mockProduct: Product = {
    id: 'prod-test-01',
    slug: 'test-tee-140gsm',
    name: 'AXDORO Classic Crewneck T-Shirt',
    category: { slug: 't-shirts', name: 'T-Shirts' },
    categoryLabel: 'T-Shirts',
    description: 'Test description',
    fabricSpec: '140 GSM',
    pricePaise: 69900,
    price: 699,
    images: ['https://example.com/test.jpg'],
    sizes: ['M', 'L'],
    colors: [{ name: 'Pitch Black', hex: '#000000' }],
    stockStatus: 'in-stock',
    stockCount: 100,
    isFeatured: true,
    isNewArrival: false,
    createdAt: '2026-10-01T10:00:00Z',
  };

  describe('1. Form Initial State & Pre-fill Removal for General Bulk Orders', () => {
    it('initializes customer-entered fields as empty strings for general bulk enquiries', () => {
      // Name, Phone, Email
      expect(modalContent).toContain("const [name, setName] = useState('');");
      expect(modalContent).toContain("const [phone, setPhone] = useState('');");
      expect(modalContent).toContain("const [email, setEmail] = useState('');");

      // Product Type, Quantity, Size Breakdown, Specifications, Delivery Timeline
      expect(modalContent).toContain("const [productType, setProductType] = useState(prefilledProduct?.name || '');");
      expect(modalContent).toContain("const [quantity, setQuantity] = useState('');");
      expect(modalContent).toContain("const [sizeBreakdown, setSizeBreakdown] = useState('');");
      expect(modalContent).toContain("const [deliveryRequirement, setDeliveryRequirement] = useState('');");
    });

    it('does NOT contain hardcoded pre-filled values in general initial state', () => {
      // Must not contain hardcoded default strings
      expect(modalContent).not.toContain("useState('T-Shirts (140 GSM)')");
      expect(modalContent).not.toContain("useState('50')");
      expect(modalContent).not.toContain("useState('S: 10, M: 20, L: 15, XL: 5')");
      expect(modalContent).not.toContain("useState('140 GSM Combed Cotton, Custom Branding')");
      expect(modalContent).not.toContain("useState('Within 2-3 weeks')");
    });

    it('syncs to empty strings when modal opens without prefilledProduct', () => {
      // In useEffect when isOpen and !prefilledProduct
      expect(modalContent).toContain("setProductType('');");
      expect(modalContent).toContain("setSpecifications('');");
      expect(modalContent).toContain("setQuantity('');");
      expect(modalContent).toContain("setSizeBreakdown('');");
      expect(modalContent).toContain("setDeliveryRequirement('');");
    });

    it('preserves product-specific details only when prefilledProduct is explicitly provided', () => {
      expect(modalContent).toContain('if (prefilledProduct) {');
      expect(modalContent).toContain('setProductType(prefilledProduct.name);');
      expect(modalContent).toContain(
        "prefilledProduct.fabricSpec\n            ? `${prefilledProduct.fabricSpec} Cotton`\n            : ''"
      );
    });
  });

  describe('2. Placeholders for All Input Fields', () => {
    it('provides indicative placeholders for all customer-entered fields', () => {
      expect(modalContent).toContain('placeholder="e.g. Rahul Sharma"');
      expect(modalContent).toContain('placeholder="e.g. +91 98765 43210"');
      expect(modalContent).toContain('placeholder="e.g. team@company.com"');
      expect(modalContent).toContain('placeholder="e.g. 140 GSM Crewneck T-Shirts"');
      expect(modalContent).toContain('placeholder="e.g. 50"');
      expect(modalContent).toContain('placeholder="e.g. S: 10, M: 25, L: 20"');
      expect(modalContent).toContain('placeholder="Mention 140 GSM or specific fabric, collar, or color preferences..."');
      expect(modalContent).toContain('placeholder="e.g. Within 2-3 weeks (indicative request)"');
    });

    it('designates quantity as required with HTML5 required attribute and indicator', () => {
      expect(modalContent).toContain('Estimated Quantity (Units) <span className="text-red-500">*</span>');
      expect(modalContent).toContain('type="number"\n                  min="1"\n                  required');
    });
  });

  describe('3. Quantity Validation & Silent Fallback Removal', () => {
    it('does NOT silently fall back to 50 when quantity is missing or invalid', () => {
      expect(modalContent).not.toContain('parseInt(quantity, 10) || 50');
      expect(modalContent).not.toContain('String(parseInt(quantity, 10) || 50)');
    });

    it('validates that quantity is a valid positive integer before submission', () => {
      expect(modalContent).toContain('const parsedQuantity = parseInt(quantity.trim(), 10);');
      expect(modalContent).toContain(
        "if (!quantity.trim() || isNaN(parsedQuantity) || parsedQuantity < 1) {"
      );
      expect(modalContent).toContain(
        "setError('Please enter a valid estimated quantity of at least 1 unit');"
      );
    });
  });

  describe('4. Message Construction & Backend Schema Compatibility', () => {
    it('constructs message cleanly without empty lines when optional fields are empty', () => {
      expect(modalContent).toContain('const messageParts: string[] = [];');
      expect(modalContent).toContain('if (productType.trim()) {');
      expect(modalContent).toContain('if (specifications.trim()) {');
      expect(modalContent).toContain('if (deliveryRequirement.trim()) {');
      expect(modalContent).toContain('if (sizeBreakdown.trim()) {');
    });

    it('guarantees message meets backend minimum length requirement (>= 5 characters) even when optional fields are empty', () => {
      expect(modalContent).toContain(
        ": `Bulk order enquiry for ${parsedQuantity} units.`;"
      );
    });

    it('submits parsed integer quantity in both JSON and FormData modes', () => {
      expect(modalContent).toContain("formData.append('quantity', String(parsedQuantity));");
      expect(modalContent).toContain('quantity: parsedQuantity,');
    });
  });

  describe('5. WhatsApp Message Formatting', () => {
    it('formats WhatsApp message dynamically omitting empty optional fields', () => {
      expect(modalContent).toContain('if (productType.trim()) textLines.push(`Product: ${productType.trim()}`);');
      expect(modalContent).toContain('if (quantity.trim()) textLines.push(`Estimated Quantity: ${quantity.trim()}`);');
      expect(modalContent).toContain('if (specifications.trim()) textLines.push(`Requirements: ${specifications.trim()}`);');
      expect(modalContent).toContain('if (deliveryRequirement.trim()) textLines.push(`Delivery Timeline: ${deliveryRequirement.trim()}`);');
      expect(modalContent).toContain('if (sizeBreakdown.trim()) textLines.push(`Size Breakdown: ${sizeBreakdown.trim()}`);');
    });
  });

  describe('6. Component Render & DOM Verification', () => {
    it('renders the general bulk modal with all input fields empty and placeholders visible', async () => {
      const { renderToString } = await import('react-dom/server');
      const React = await import('react');
      const { BulkEnquiryModal } = await import('./components/BulkEnquiryModal.tsx');

      const html = renderToString(
        React.createElement(BulkEnquiryModal, {
          isOpen: true,
          onClose: () => {},
          prefilledProduct: null,
        })
      );

      // Verify all placeholders are present in rendered markup
      expect(html).toContain('placeholder="e.g. Rahul Sharma"');
      expect(html).toContain('placeholder="e.g. +91 98765 43210"');
      expect(html).toContain('placeholder="e.g. team@company.com"');
      expect(html).toContain('placeholder="e.g. 140 GSM Crewneck T-Shirts"');
      expect(html).toContain('placeholder="e.g. 50"');
      expect(html).toContain('placeholder="e.g. S: 10, M: 25, L: 20"');
      expect(html).toContain('placeholder="Mention 140 GSM or specific fabric, collar, or color preferences..."');
      expect(html).toContain('placeholder="e.g. Within 2-3 weeks (indicative request)"');

      // Verify no hardcoded values are rendered in the HTML
      expect(html).not.toContain('value="T-Shirts (140 GSM)"');
      expect(html).not.toContain('value="50"');
      expect(html).not.toContain('value="S: 10, M: 20, L: 15, XL: 5"');
      expect(html).not.toContain('value="Within 2-3 weeks"');
      expect(html).not.toContain('140 GSM Combed Cotton, Custom Branding');
    });

    it('renders product-specific name and fabric spec only when prefilledProduct is provided', async () => {
      const { renderToString } = await import('react-dom/server');
      const React = await import('react');
      const { BulkEnquiryModal } = await import('./components/BulkEnquiryModal.tsx');

      const html = renderToString(
        React.createElement(BulkEnquiryModal, {
          isOpen: true,
          onClose: () => {},
          prefilledProduct: mockProduct,
        })
      );

      // Product style focus should have the product name
      expect(html).toContain(`value="${mockProduct.name}"`);
      // Specifications should contain the fabric spec
      expect(html).toContain('140 GSM Cotton');

      // Quantity, size breakdown, and timeline should STILL be empty
      expect(html).not.toContain('value="50"');
      expect(html).not.toContain('value="S: 10, M: 20, L: 15, XL: 5"');
      expect(html).not.toContain('value="Within 2-3 weeks"');
    });
  });
});
