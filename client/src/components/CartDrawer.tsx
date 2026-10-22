import React, { useEffect } from 'react';
import { CartItem, formatPaiseToINR } from '../types/product.ts';
import { X, Trash2, Plus, Minus, ShoppingBag, ShieldCheck, ImageOff, ArrowRight } from 'lucide-react';
import { useScrollLock } from '../utils/scrollLock.ts';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onSetQuantity?: (itemId: string, newQuantity: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearCart: () => void;
  onProceedToCheckout: () => void;
}

interface CartItemQuantityControlProps {
  item: CartItem;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onSetQuantity?: (itemId: string, newQuantity: number) => void;
}

const CartItemQuantityControl: React.FC<CartItemQuantityControlProps> = ({
  item,
  onUpdateQuantity,
  onSetQuantity,
}) => {
  const [localVal, setLocalVal] = React.useState(String(item.quantity));

  // Sync localVal whenever item.quantity changes from props
  React.useEffect(() => {
    setLocalVal(String(item.quantity));
  }, [item.quantity]);

  // Determine available stock: variant stock if variantId is set, else product stockCount
  const variant = item.variantId
    ? item.product.variants?.find((v) => v.id === item.variantId)
    : item.product.variants?.find(
        (v) => v.size === item.selectedSize && (!item.selectedColor || v.color === item.selectedColor)
      );
  const rawStock = variant ? variant.stock : item.product.stockCount;
  const maxStock = Math.max(1, Math.min(typeof rawStock === 'number' && rawStock > 0 ? rawStock : 20, 20));

  const commitValue = (valToCommit: string) => {
    const parsed = parseInt(valToCommit.replace(/[^0-9]/g, ''), 10);
    if (isNaN(parsed) || parsed < 1) {
      setLocalVal(String(item.quantity));
    } else {
      const clamped = Math.max(1, Math.min(maxStock, parsed));
      setLocalVal(String(clamped));
      if (clamped !== item.quantity) {
        if (onSetQuantity) {
          onSetQuantity(item.id, clamped);
        } else {
          onUpdateQuantity(item.id, clamped - item.quantity);
        }
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/[^0-9]/g, '');
    setLocalVal(clean);
  };

  const handleStep = (delta: number) => {
    const next = item.quantity + delta;
    if (next < 1) {
      // Minimum is 1; do not decrement below 1 (removal is handled by trash icon)
      return;
    }
    const clamped = Math.min(maxStock, next);
    if (clamped !== item.quantity) {
      if (onSetQuantity) {
        onSetQuantity(item.id, clamped);
      } else {
        onUpdateQuantity(item.id, delta);
      }
    }
  };

  return (
    <div className="flex items-center rounded border border-axdoro-border bg-axdoro-surface">
      <button
        type="button"
        onClick={() => handleStep(-1)}
        disabled={item.quantity <= 1}
        className="px-2 py-1 text-axdoro-text-muted hover:text-axdoro-charcoal text-xs cursor-pointer disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-axdoro-accent"
        aria-label="Decrease quantity"
      >
        <Minus className="w-3 h-3" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={localVal}
        onChange={handleChange}
        onBlur={() => commitValue(localVal)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitValue(localVal);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-8 text-center text-xs font-bold text-axdoro-charcoal bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-axdoro-accent rounded py-0.5"
        aria-label={`Quantity for ${item.product.name}`}
      />
      <button
        type="button"
        onClick={() => handleStep(1)}
        disabled={item.quantity >= maxStock}
        className="px-2 py-1 text-axdoro-text-muted hover:text-axdoro-charcoal text-xs cursor-pointer disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-axdoro-accent"
        aria-label="Increase quantity"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
};

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onSetQuantity,
  onRemoveItem,
  onClearCart,
  onProceedToCheckout,
}) => {
  // Global reference-counted scroll lock while drawer is open
  useScrollLock(isOpen);

  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Strict integer paise math for internal cart line calculation
  const subtotalPaise = cartItems.reduce(
    (acc, item) => acc + (item.pricePaise || item.product.price * 100) * item.quantity,
    0
  );

  const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div
          className="w-screen max-w-md bg-axdoro-surface border-l border-axdoro-border shadow-elevated flex flex-col justify-between"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer Header */}
          <div className="p-5 sm:p-6 border-b border-axdoro-border bg-axdoro-bg flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-5 h-5 text-axdoro-accent-muted" />
              <h2 id="cart-drawer-title" className="text-base sm:text-lg font-bold text-axdoro-charcoal tracking-tight">
                Your Shopping Bag
              </h2>
              <span className="text-xs font-mono font-bold text-axdoro-charcoal bg-axdoro-surface px-2.5 py-0.5 rounded-full border border-axdoro-border shadow-subtle">
                {totalItems}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-surface transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              aria-label="Close shopping bag"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5">
            {cartItems.length > 0 ? (
              cartItems.map((item) => {
                const itemImage = item.product.images && item.product.images.length > 0
                  ? item.product.images[0]
                  : '';

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-axdoro-border bg-axdoro-bg/50 p-3.5 flex gap-3.5 items-center justify-between shadow-subtle hover:border-axdoro-border-strong transition-colors"
                  >
                    {itemImage ? (
                      <img
                        src={itemImage}
                        alt={item.product.name}
                        className="w-16 h-20 rounded-lg object-cover bg-stone-100 border border-axdoro-border flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-20 rounded-lg bg-stone-100 border border-axdoro-border flex items-center justify-center flex-shrink-0 text-stone-400">
                        <ImageOff className="w-5 h-5" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-axdoro-charcoal truncate">
                        {item.product.name}
                      </h4>
                      <p className="text-[11px] text-axdoro-text-muted mt-0.5">
                        Size: <span className="text-axdoro-charcoal font-semibold">{item.selectedSize}</span> &bull; Color: <span className="text-axdoro-charcoal font-semibold">{item.selectedColor}</span>
                      </p>
                      <p className="text-xs font-extrabold text-axdoro-charcoal mt-1.5">
                        {formatPaiseToINR(item.pricePaise || item.product.price * 100)}
                      </p>
                    </div>

                    {/* Quantity & Delete */}
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => onRemoveItem(item.id)}
                        className="text-axdoro-text-muted hover:text-red-600 transition-colors p-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 rounded"
                        title="Remove item"
                        aria-label={`Remove ${item.product.name} from bag`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <CartItemQuantityControl
                        item={item}
                        onUpdateQuantity={onUpdateQuantity}
                        onSetQuantity={onSetQuantity}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-20">
                <div className="w-14 h-14 rounded-full bg-axdoro-bg border border-axdoro-border flex items-center justify-center mx-auto text-axdoro-accent-muted mb-3.5">
                  <ShoppingBag className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-axdoro-charcoal">Your bag is empty</h3>
                <p className="text-xs text-axdoro-text-muted mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Explore our T-Shirts (140 GSM) and tailored shirts collection to add styles to your bag.
                </p>
                <button
                  onClick={onClose}
                  className="mt-5 px-4 py-2 rounded-lg bg-axdoro-charcoal text-white text-xs font-semibold hover:bg-black transition-colors cursor-pointer shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                >
                  Explore Collection
                </button>
              </div>
            )}
          </div>

          {/* Drawer Footer & Checkout Action */}
          {cartItems.length > 0 && (
            <div className="p-5 sm:p-6 border-t border-axdoro-border bg-axdoro-bg space-y-4">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-axdoro-text-muted">
                  <span>Subtotal</span>
                  <span className="font-semibold text-axdoro-charcoal">{formatPaiseToINR(subtotalPaise)}</span>
                </div>
                <div className="flex justify-between text-axdoro-text-muted">
                  <span>Standard Shipping</span>
                  <span className="text-emerald-700 font-semibold">Free (COD Launch)</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-axdoro-charcoal pt-2 border-t border-axdoro-border">
                  <span>Estimated Total</span>
                  <span className="text-base text-axdoro-charcoal">{formatPaiseToINR(subtotalPaise)}</span>
                </div>
              </div>

              {/* Trust Badge */}
              <div className="p-3 rounded-lg border border-axdoro-border bg-axdoro-surface text-xs text-axdoro-text-muted flex items-center gap-2 shadow-subtle">
                <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-[11px] leading-tight">
                  Authentic combed garments &bull; Cash on Delivery across India.
                </span>
              </div>

              {/* Checkout Trigger */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onProceedToCheckout();
                }}
                className="w-full py-3.5 rounded-lg bg-axdoro-charcoal hover:bg-black text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-subtle flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                <span>Proceed to Checkout</span>
                <span className="font-normal opacity-70">&bull;</span>
                <span>{formatPaiseToINR(subtotalPaise)}</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>

              <button
                type="button"
                onClick={onClearCart}
                className="w-full text-center text-[11px] text-axdoro-text-muted hover:text-axdoro-charcoal transition-colors py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-axdoro-accent rounded"
              >
                Clear Shopping Bag
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
