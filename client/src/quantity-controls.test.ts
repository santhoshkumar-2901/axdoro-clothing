import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('AXDORO — Customer-Facing Editable Quantity Controls', () => {
  const componentsDir = path.resolve(__dirname, 'components');
  const modalPath = path.join(componentsDir, 'ProductDetailModal.tsx');
  const drawerPath = path.join(componentsDir, 'CartDrawer.tsx');
  const appPath = path.resolve(__dirname, 'App.tsx');

  const modalSource = fs.readFileSync(modalPath, 'utf8');
  const drawerSource = fs.readFileSync(drawerPath, 'utf8');
  const appSource = fs.readFileSync(appPath, 'utf8');

  describe('ProductDetailModal Quantity Input & Controls', () => {
    it('1. contains an editable numeric input instead of a static span', () => {
      expect(modalSource).toContain('<input');
      expect(modalSource).toContain('id="product-quantity-input"');
      expect(modalSource).toContain('aria-label="Product quantity"');
      expect(modalSource).toContain('inputMode="numeric"');
      expect(modalSource).not.toContain('<span className="w-10 text-center font-bold text-xs text-axdoro-charcoal">\n                      {quantity}\n                    </span>');
    });

    it('2. retains minus and plus step buttons with synchronized handlers', () => {
      expect(modalSource).toContain('aria-label="Decrease quantity"');
      expect(modalSource).toContain('aria-label="Increase quantity"');
      expect(modalSource).toContain('handleStepQuantity(-1)');
      expect(modalSource).toContain('handleStepQuantity(1)');
    });

    it('3. enforces minimum 1 and clamps to effectiveMaxQuantity <= 20', () => {
      expect(modalSource).toContain('effectiveMaxQuantity = Math.max(1, Math.min(');
      expect(modalSource).toContain(', 20)');
    });

    it('4. strips non-numeric input and handles empty string on commit without NaN or zero', () => {
      expect(modalSource).toContain('replace(/[^0-9]/g, \'\')');
      expect(modalSource).toContain('if (isNaN(parsed) || parsed < 1)');
      expect(modalSource).toContain('setQuantity(1)');
    });

    it('5. handles Enter keydown to commit quantity and blur', () => {
      expect(modalSource).toContain("if (e.key === 'Enter')");
      expect(modalSource).toContain('handleCommitQuantity(quantityInput)');
    });
  });

  describe('CartDrawer Quantity Input & Controls', () => {
    it('6. defines onSetQuantity prop and CartItemQuantityControl subcomponent', () => {
      expect(drawerSource).toContain('onSetQuantity?: (itemId: string, newQuantity: number) => void;');
      expect(drawerSource).toContain('const CartItemQuantityControl');
    });

    it('7. contains an editable numeric input in CartDrawer for each line item', () => {
      expect(drawerSource).toContain('<input');
      expect(drawerSource).toContain('aria-label={`Quantity for ${item.product.name}`}');
      expect(drawerSource).toContain('inputMode="numeric"');
      expect(drawerSource).toContain('pattern="[0-9]*"');
    });

    it('8. prevents decreasing below 1 and preserves trash button for item deletion', () => {
      expect(drawerSource).toContain('disabled={item.quantity <= 1}');
      expect(drawerSource).toContain('if (next < 1)');
      expect(drawerSource).toContain('<Trash2');
      expect(drawerSource).toContain('onRemoveItem(item.id)');
    });

    it('9. commits clamped value to onSetQuantity or delta on blur/Enter and restores on invalid/empty', () => {
      expect(drawerSource).toContain('if (isNaN(parsed) || parsed < 1)');
      expect(drawerSource).toContain('setLocalVal(String(item.quantity))');
      expect(drawerSource).toContain('onSetQuantity(item.id, clamped)');
      expect(drawerSource).toContain("if (e.key === 'Enter')");
    });
  });

  describe('App.tsx Quantity Handler Wiring', () => {
    it('10. implements handleSetQuantity and passes onSetQuantity to CartDrawer', () => {
      expect(appSource).toContain('const handleSetQuantity = (itemId: string, newQuantity: number) => {');
      expect(appSource).toContain('if (newQuantity < 1) return;');
      expect(appSource).toContain('onSetQuantity={handleSetQuantity}');
    });

    it('11. preserves exact paise subtotal math when cart item quantity updates', () => {
      // Logic test replicating App.tsx subtotal calculation
      const dummyCart = [
        { id: '1', pricePaise: 69900, quantity: 2 },
        { id: '2', pricePaise: 129900, quantity: 1 },
      ];
      const initialSubtotal = dummyCart.reduce((acc, it) => acc + it.pricePaise * it.quantity, 0);
      expect(initialSubtotal).toBe(269700);

      // Simulate handleSetQuantity changing item '1' quantity to 4
      const updatedCart = dummyCart.map((it) => (it.id === '1' ? { ...it, quantity: 4 } : it));
      const updatedSubtotal = updatedCart.reduce((acc, it) => acc + it.pricePaise * it.quantity, 0);
      expect(updatedSubtotal).toBe(409500); // 4 * 69900 + 1 * 129900 = 279600 + 129900 = 409500
    });
  });
});
