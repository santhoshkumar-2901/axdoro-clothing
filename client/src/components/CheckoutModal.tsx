import React, { useState } from 'react';
import { CartItem, formatPaiseToINR } from '../types/product.ts';
import { submitOrder, CreateOrderPayload, CreatedOrderData } from '../api/orders.ts';
import { fetchProductBySlug } from '../api/catalogue.ts';
import {
  normalizeAndValidatePhone,
  getOrGenerateIdempotencyKey,
  clearIdempotencySession,
} from '../utils/idempotency.ts';
import { useScrollLock } from '../utils/scrollLock.ts';
import { X, CheckCircle2, AlertTriangle, Loader2, ShieldCheck, Truck, ShoppingBag, ArrowLeft } from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onOrderSuccess: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  cartItems,
  onOrderSuccess,
}) => {
  // Global reference-counted scroll lock while checkout modal is open
  useScrollLock(isOpen);

  // Form fields
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [notes, setNotes] = useState('');

  // Status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmedOrder, setConfirmedOrder] = useState<CreatedOrderData | null>(null);

  if (!isOpen) return null;

  // Strict integer paise math for subtotal and grand total
  const subtotalPaise = cartItems.reduce(
    (acc, item) => acc + (item.pricePaise || item.product.price * 100) * item.quantity,
    0
  );
  const deliveryPaise = 0; // Free COD delivery for launch
  const grandTotalPaise = subtotalPaise + deliveryPaise;

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!customerName.trim() || customerName.trim().length < 2) {
      errors.customerName = 'Please enter your full name (at least 2 characters)';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customerEmail.trim() || !emailRegex.test(customerEmail.trim())) {
      errors.customerEmail = 'Please enter a valid email address';
    }

    const phoneValidation = normalizeAndValidatePhone(customerPhone);
    if (!phoneValidation.isValid) {
      errors.customerPhone = phoneValidation.error || 'Please enter a valid phone number (10–15 digits)';
    }

    if (!addressLine1.trim() || addressLine1.trim().length < 5) {
      errors.addressLine1 = 'Please enter delivery address (at least 5 characters)';
    }

    if (!city.trim() || city.trim().length < 2) {
      errors.city = 'Please enter your city';
    }

    if (!state.trim() || state.trim().length < 2) {
      errors.state = 'Please enter your state';
    }

    const pinRegex = /^[1-9][0-9]{5}$/;
    if (!pinRegex.test(pincode.trim())) {
      errors.pincode = 'Please enter a valid 6-digit Indian PIN code';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (cartItems.length === 0) {
      setErrorMessage('Your shopping bag is empty. Please add items before checking out.');
      return;
    }

    if (!validateForm()) {
      return;
    }

    const phoneValidation = normalizeAndValidatePhone(customerPhone);
    if (!phoneValidation.isValid) {
      setFieldErrors((prev) => ({
        ...prev,
        customerPhone: phoneValidation.error || 'Please enter a valid phone number',
      }));
      return;
    }
    const normalizedCustomerPhone = phoneValidation.normalized;

    setIsSubmitting(true);

    try {
      // 1. Resolve variant IDs for all cart items
      // If variantId was already set during modal selection, use it.
      // Otherwise, resolve against product.variants or fetch product details by slug.
      const resolvedItems: { variantId: string; quantity: number }[] = [];

      for (const item of cartItems) {
        let variantId = item.variantId;

        if (!variantId) {
          // Attempt resolution from existing product variants if populated
          const matching = item.product.variants?.find(
            (v) => v.size === item.selectedSize && (!item.selectedColor || v.color === item.selectedColor)
          );
          variantId = matching?.id;
        }

        if (!variantId) {
          // Fetch full product details from API to resolve authoritative variant UUID
          const fullProduct = await fetchProductBySlug(item.product.slug);
          const matching = fullProduct.variants?.find(
            (v) => v.size === item.selectedSize && (!item.selectedColor || v.color === item.selectedColor)
          );
          variantId = matching?.id;
        }

        if (!variantId) {
          throw new Error(
            `Unable to resolve variant ID for "${item.product.name}" (${item.selectedSize}). Please remove and re-add this item.`
          );
        }

        resolvedItems.push({
          variantId,
          quantity: item.quantity,
        });
      }

      // Consolidate duplicate variant IDs if any exist in the cart
      const consolidatedMap = new Map<string, number>();
      for (const it of resolvedItems) {
        consolidatedMap.set(it.variantId, (consolidatedMap.get(it.variantId) || 0) + it.quantity);
      }
      const finalItems = Array.from(consolidatedMap.entries()).map(([variantId, quantity]) => ({
        variantId,
        quantity,
      }));

      // Retrieve or generate stable idempotency key:
      // Reuses previous key if identical logical payload is retried after a failure/timeout.
      // Automatically generates a fresh key if any field (items, address, customer details) has changed.
      const orderPayloadCore = {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim().toLowerCase(),
        customerPhone: normalizedCustomerPhone,
        shippingAddressLine1: addressLine1.trim(),
        shippingAddressLine2: addressLine2.trim() || undefined,
        shippingCity: city.trim(),
        shippingState: state.trim(),
        shippingPincode: pincode.trim(),
        items: finalItems,
        paymentMethod: 'COD' as const,
        notes: notes.trim() || undefined,
      };

      const { idempotencyKey } = await getOrGenerateIdempotencyKey(orderPayloadCore);

      const payload: CreateOrderPayload = {
        ...orderPayloadCore,
        idempotencyKey,
      };

      const res = await submitOrder(payload);

      if (res.data) {
        // Clear idempotency session only after confirmed successful response
        clearIdempotencySession();
        setConfirmedOrder(res.data);
        onOrderSuccess(); // Clears shopping bag
      } else {
        throw new Error(res.message || 'Order created without confirmation details.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Checkout failed. Please review your details and try again.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
    >
      <div
        className="relative w-full max-w-3xl bg-axdoro-surface border border-axdoro-border rounded-2xl shadow-elevated overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-axdoro-border bg-axdoro-bg flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-axdoro-accent-muted" />
            <h2 id="checkout-modal-title" className="text-lg font-bold text-axdoro-charcoal tracking-tight">
              {confirmedOrder ? 'Order Confirmed' : 'Checkout & Delivery'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-surface transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            aria-label="Close checkout modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {confirmedOrder ? (
          /* Order Confirmation View */
          <div className="p-6 sm:p-8 space-y-6 text-center max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="text-[11px] font-mono text-axdoro-accent-muted uppercase tracking-widest block font-bold mb-1">
                Cash on Delivery Order Confirmed
              </span>
              <h3 className="text-2xl font-black text-axdoro-charcoal">
                Thank you, {confirmedOrder.customerName}!
              </h3>
              <p className="text-xs text-axdoro-text-muted mt-1.5 leading-relaxed">
                Your order has been recorded. Our team will verify and prepare your shipment.
              </p>
            </div>

            <div className="rounded-xl border border-axdoro-border bg-axdoro-bg p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-axdoro-border">
                <span className="text-axdoro-text-muted">Order Number:</span>
                <span className="font-mono font-bold text-axdoro-charcoal">{confirmedOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-axdoro-border">
                <span className="text-axdoro-text-muted">Payment Mode:</span>
                <span className="font-semibold text-axdoro-charcoal">Cash on Delivery (COD)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-axdoro-border">
                <span className="text-axdoro-text-muted">Delivery To:</span>
                <span className="font-semibold text-axdoro-charcoal text-right">
                  {confirmedOrder.shippingCity}, {confirmedOrder.shippingState} – {confirmedOrder.shippingPincode}
                </span>
              </div>
              <div className="flex justify-between py-1 pt-2 text-sm font-bold">
                <span className="text-axdoro-charcoal">Amount Payable:</span>
                <span className="text-axdoro-accent-muted">{formatPaiseToINR(confirmedOrder.grandTotalPaise)}</span>
              </div>
            </div>

            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-left flex items-start gap-2.5 text-xs text-emerald-800">
              <Truck className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
              <span>
                Please keep exact cash ready upon delivery. Confirmation details sent to <strong>{confirmedOrder.customerEmail}</strong>.
              </span>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-lg bg-axdoro-charcoal hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition-colors shadow-subtle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          /* Checkout Form View */
          <form onSubmit={handleCheckoutSubmit} className="p-6 sm:p-8 space-y-6">
            {/* Error Banner */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs flex items-start gap-2.5" role="alert">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold block">Order Submission Error</span>
                  <p className="text-[11px] text-red-800">{errorMessage}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Contact & Delivery Address */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-axdoro-charcoal pb-1 border-b border-axdoro-border">
                  1. Contact Details
                </h3>

                <div>
                  <label className="text-xs font-semibold text-axdoro-charcoal block mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-axdoro-border-strong bg-axdoro-bg text-axdoro-charcoal placeholder-axdoro-text-muted focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                  />
                  {fieldErrors.customerName && (
                    <span className="text-[11px] text-red-600 mt-1 block">{fieldErrors.customerName}</span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-axdoro-charcoal block mb-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-axdoro-border-strong bg-axdoro-bg text-axdoro-charcoal placeholder-axdoro-text-muted focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                    />
                    {fieldErrors.customerEmail && (
                      <span className="text-[11px] text-red-600 mt-1 block">{fieldErrors.customerEmail}</span>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-axdoro-charcoal block mb-1">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-axdoro-border-strong bg-axdoro-bg text-axdoro-charcoal placeholder-axdoro-text-muted focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                    />
                    {fieldErrors.customerPhone && (
                      <span className="text-[11px] text-red-600 mt-1 block">{fieldErrors.customerPhone}</span>
                    )}
                  </div>
                </div>

                <h3 className="text-xs font-bold uppercase tracking-wider text-axdoro-charcoal pt-3 pb-1 border-b border-axdoro-border">
                  2. Delivery Address
                </h3>

                <div>
                  <label className="text-xs font-semibold text-axdoro-charcoal block mb-1">
                    Street Address &bull; House/Flat No. <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="e.g. Flat 402, Green Park Apartments"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-axdoro-border-strong bg-axdoro-bg text-axdoro-charcoal placeholder-axdoro-text-muted focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                  />
                  {fieldErrors.addressLine1 && (
                    <span className="text-[11px] text-red-600 mt-1 block">{fieldErrors.addressLine1}</span>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-axdoro-charcoal block mb-1">
                    Area / Landmark (Optional)
                  </label>
                  <input
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="e.g. Near Metro Station"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-axdoro-border-strong bg-axdoro-bg text-axdoro-charcoal placeholder-axdoro-text-muted focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-xs font-semibold text-axdoro-charcoal block mb-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Bengaluru"
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-axdoro-border-strong bg-axdoro-bg text-axdoro-charcoal placeholder-axdoro-text-muted focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                    />
                    {fieldErrors.city && (
                      <span className="text-[10px] text-red-600 mt-0.5 block">{fieldErrors.city}</span>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-axdoro-charcoal block mb-1">
                      State <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="e.g. Karnataka"
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-axdoro-border-strong bg-axdoro-bg text-axdoro-charcoal placeholder-axdoro-text-muted focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                    />
                    {fieldErrors.state && (
                      <span className="text-[10px] text-red-600 mt-0.5 block">{fieldErrors.state}</span>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-axdoro-charcoal block mb-1">
                      PIN Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      placeholder="e.g. 560001"
                      maxLength={6}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-axdoro-border-strong bg-axdoro-bg text-axdoro-charcoal placeholder-axdoro-text-muted focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                    />
                    {fieldErrors.pincode && (
                      <span className="text-[10px] text-red-600 mt-0.5 block">{fieldErrors.pincode}</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-axdoro-charcoal block mb-1">
                    Special Delivery Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Deliver between 2 PM and 6 PM"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-axdoro-border-strong bg-axdoro-bg text-axdoro-charcoal placeholder-axdoro-text-muted focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                  />
                </div>
              </div>

              {/* Right Column: Order Items & Payment Method */}
              <div className="space-y-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-axdoro-charcoal pb-1 border-b border-axdoro-border">
                    3. Order Summary ({cartItems.length} items)
                  </h3>

                  <div className="max-h-48 overflow-y-auto space-y-2.5 pr-1 mt-2.5">
                    {cartItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-lg border border-axdoro-border bg-axdoro-bg flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.product.images && item.product.images.length > 0 && (
                            <img
                              src={item.product.images[0]}
                              alt={item.product.name}
                              className="w-10 h-12 rounded object-cover border border-axdoro-border bg-stone-100 flex-shrink-0"
                            />
                          )}
                          <div className="truncate">
                            <span className="font-bold text-axdoro-charcoal block truncate">{item.product.name}</span>
                            <span className="text-[11px] text-axdoro-text-muted">
                              Size: {item.selectedSize} &bull; Qty: {item.quantity}
                            </span>
                          </div>
                        </div>
                        <span className="font-semibold text-axdoro-charcoal flex-shrink-0 ml-2">
                          {formatPaiseToINR((item.pricePaise || item.product.price * 100) * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Payment Method Selector */}
                  <h3 className="text-xs font-bold uppercase tracking-wider text-axdoro-charcoal pt-4 pb-1 border-b border-axdoro-border">
                    4. Payment Mode
                  </h3>

                  <div className="mt-2.5 p-3.5 rounded-xl border-2 border-axdoro-charcoal bg-axdoro-bg space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-axdoro-charcoal flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-axdoro-accent-muted" /> Cash on Delivery (COD)
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                        ACTIVE
                      </span>
                    </div>
                    <p className="text-[11px] text-axdoro-text-muted leading-relaxed">
                      Pay cash upon delivery at your doorstep across India. Zero online transaction fees.
                    </p>
                    <p className="text-[10px] text-axdoro-text-muted italic pt-1">
                      (Online UPI &amp; Razorpay payment gateways will activate with live merchant credentials in Phase 5 feature release).
                    </p>
                  </div>

                  {/* Totals Breakdown */}
                  <div className="rounded-xl border border-axdoro-border bg-axdoro-surface p-3.5 mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between text-axdoro-text-muted">
                      <span>Subtotal</span>
                      <span className="font-semibold text-axdoro-charcoal">{formatPaiseToINR(subtotalPaise)}</span>
                    </div>
                    <div className="flex justify-between text-axdoro-text-muted">
                      <span>Shipping Fee</span>
                      <span className="text-emerald-700 font-semibold">Free (COD Launch)</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-axdoro-charcoal pt-2 border-t border-axdoro-border">
                      <span>Total Payable</span>
                      <span className="text-base text-axdoro-charcoal">{formatPaiseToINR(grandTotalPaise)}</span>
                    </div>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="space-y-2 pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 rounded-lg bg-axdoro-charcoal hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition-all shadow-subtle flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Confirming Order...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Place Cash on Delivery Order &bull; {formatPaiseToINR(grandTotalPaise)}</span>
                      </>
                    )}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={onClose}
                      className="text-[11px] text-axdoro-text-muted hover:text-axdoro-charcoal transition-colors inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3 h-3" /> Return to shopping bag
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
