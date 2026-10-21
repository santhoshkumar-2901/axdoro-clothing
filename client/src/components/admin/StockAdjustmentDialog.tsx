import React, { useState } from 'react';
import { Sliders, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Input, Label } from '../ui/input.tsx';
import { useScrollLock } from '../../utils/scrollLock.ts';

interface StockAdjustmentDialogProps {
  variantId: string;
  productName: string;
  size: string;
  color: string;
  sku: string;
  currentStock: number;
  onSave: (quantity: number, reason: string) => Promise<void>;
  onClose: () => void;
}

export const StockAdjustmentDialog: React.FC<StockAdjustmentDialogProps> = ({
  productName,
  size,
  color,
  sku,
  currentStock,
  onSave,
  onClose,
}) => {
  // Global reference-counted scroll lock while stock adjustment dialog is open
  useScrollLock(true);

  const [quantity, setQuantity] = useState<number>(currentStock);
  const [reason, setReason] = useState<string>('Physical warehouse count reconciliation');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(quantity, reason);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in">
      <div className="w-full max-w-md my-auto animate-in fade-in zoom-in-95 duration-150">
        <Card className="border-axdoro-border bg-axdoro-surface shadow-elevated rounded-2xl overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between px-6 py-4 border-b border-axdoro-border bg-axdoro-surface">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-axdoro-accent-muted" />
                <CardTitle className="text-base font-bold text-axdoro-charcoal">Adjust Variant Inventory</CardTitle>
              </div>
              <CardDescription className="text-xs text-axdoro-text-muted">
                Updates variant stock count atomically and creates an immutable audit record.
              </CardDescription>
            </div>
            <button
              onClick={onClose}
              className="text-axdoro-text-muted hover:text-axdoro-charcoal p-1.5 rounded-lg hover:bg-axdoro-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </CardHeader>

          <CardContent className="p-6 space-y-4">
            <div className="p-3.5 rounded-xl bg-axdoro-bg border border-axdoro-border text-xs space-y-1">
              <div className="font-bold text-axdoro-charcoal text-sm">{productName}</div>
              <div className="text-axdoro-text-muted font-mono text-[11px]">
                Size: <span className="text-axdoro-charcoal font-semibold">{size}</span> &bull; Color: <span className="text-axdoro-charcoal font-semibold">{color}</span> &bull; SKU: <span className="text-axdoro-charcoal font-semibold">{sku}</span>
              </div>
              <div className="text-axdoro-text-muted pt-1 text-[11px]">
                Current Registered Stock: <span className="font-bold font-mono text-axdoro-charcoal">{currentStock}</span> units
              </div>
            </div>

            <form id="stock-adjust-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="stock-qty" className="text-xs font-semibold text-axdoro-charcoal">
                  New Stock Units (Quantity)
                </Label>
                <Input
                  id="stock-qty"
                  type="number"
                  min="0"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stock-reason" className="text-xs font-semibold text-axdoro-charcoal">
                  Adjustment Rationale / Reason
                </Label>
                <Input
                  id="stock-reason"
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Physical inventory count verified"
                />
              </div>
            </form>
          </CardContent>

          <CardFooter className="flex justify-end gap-2 border-t border-axdoro-border px-6 py-4 bg-axdoro-surface-muted/30">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="border-axdoro-border text-axdoro-charcoal hover:bg-axdoro-bg cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="stock-adjust-form"
              disabled={isSubmitting}
              className="bg-axdoro-charcoal hover:bg-black text-white cursor-pointer"
            >
              {isSubmitting ? 'Saving...' : 'Save Stock'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
