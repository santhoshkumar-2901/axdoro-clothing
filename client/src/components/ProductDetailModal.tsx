import React, { useState, useEffect, useRef } from 'react';
import { Product, ProductVariant } from '../types/product.ts';
import { X, Check, ShoppingBag, Layers, AlertCircle, Plus, Minus, ImageOff } from 'lucide-react';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (
    product: Product,
    size: string,
    color: string,
    quantity: number,
    variant?: ProductVariant
  ) => void;
  onOpenBulkWithProduct: (product: Product) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
  onOpenBulkWithProduct,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Sync state whenever active product changes
  useEffect(() => {
    if (product) {
      setSelectedImageIndex(0);
      setSelectedSize('');
      setSelectedColor(product.colors[0]?.name || 'Standard');
      setQuantity(1);
      setSizeError(false);
      setAddedSuccess(false);
      setImageError(false);
    }
  }, [product]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && product) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose]);

  // Lock background document scrolling while modal is open, and safely restore on close/unmount
  useEffect(() => {
    if (!product) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Prevent touch gestures directly on the backdrop from dragging/scrolling the background
    const overlay = overlayRef.current;
    const handleTouchMove = (e: TouchEvent) => {
      if (e.target === overlay) {
        e.preventDefault();
      }
    };

    if (overlay) {
      overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      if (overlay) {
        overlay.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, [product]);

  if (!product) return null;

  // Resolve matching variant from authoritative variant list
  const matchingVariant = product.variants?.find(
    (v) => v.size === selectedSize && (!selectedColor || v.color === selectedColor)
  );

  const activePrice = matchingVariant ? matchingVariant.price : product.price;
  const activeOriginalPrice = matchingVariant?.originalPrice ?? product.originalPrice;

  const discountPercent = activeOriginalPrice
    ? Math.round(((activeOriginalPrice - activePrice) / activeOriginalPrice) * 100)
    : 0;

  // Stock assessment
  const isEntirelyOutOfStock = product.stockStatus === 'out-of-stock' || product.stockCount <= 0;
  const isSelectedVariantOutOfStock = matchingVariant !== undefined && (matchingVariant.stock <= 0 || !matchingVariant.isActive);
  const maxAvailableQuantity = matchingVariant ? matchingVariant.stock : product.stockCount;

  const handleAddToCart = () => {
    if (!selectedSize && product.sizes.length > 0) {
      setSizeError(true);
      return;
    }
    if (isEntirelyOutOfStock || isSelectedVariantOutOfStock) {
      return;
    }

    setSizeError(false);
    onAddToCart(product, selectedSize || 'Standard', selectedColor || 'Standard', quantity, matchingVariant);
    setAddedSuccess(true);
    setTimeout(() => setAddedSuccess(false), 2000);
  };

  const currentImage = product.images && product.images.length > 0
    ? product.images[selectedImageIndex] || product.images[0]
    : '';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6 overscroll-contain animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] sm:max-h-[88vh] bg-axdoro-surface border border-axdoro-border rounded-2xl shadow-elevated overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button - pinned at top right */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30 p-2 rounded-full bg-axdoro-surface/90 backdrop-blur-md text-axdoro-text-muted hover:text-axdoro-charcoal border border-axdoro-border hover:bg-axdoro-bg shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
          aria-label="Close product details dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Content Container: single scroll on mobile, split columns on desktop */}
        <div className="overflow-y-auto md:overflow-hidden flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Left: Product Images Gallery */}
          <div className="md:w-1/2 min-h-0 p-5 sm:p-6 bg-axdoro-bg/50 flex flex-col justify-between border-b md:border-b-0 md:border-r border-axdoro-border flex-shrink-0 md:max-h-full md:overflow-y-auto">
            {/* Main Image Container */}
            <div className="relative aspect-[3/4] max-h-[36vh] sm:max-h-[44vh] md:max-h-[50vh] rounded-xl overflow-hidden bg-stone-100 border border-axdoro-border mb-3 sm:mb-4 mx-auto w-full flex items-center justify-center">
              {imageError || !currentImage ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-stone-100 text-axdoro-text-muted text-xs">
                  <ImageOff className="w-10 h-10 text-stone-400 mb-2" />
                  <span className="font-semibold text-axdoro-charcoal text-sm">Image Unavailable</span>
                  <span className="text-xs text-axdoro-text-muted mt-1">{product.name}</span>
                </div>
              ) : (
                <img
                  src={currentImage}
                  alt={product.name}
                  onError={() => setImageError(true)}
                  className="w-full h-full object-cover object-center transition-all duration-300"
                />
              )}

              {product.fabricSpec && (
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-axdoro-surface/90 border border-axdoro-accent/60 text-axdoro-accent-muted text-xs font-mono font-bold tracking-wider shadow-subtle backdrop-blur-sm">
                  {product.fabricSpec}
                </div>
              )}
            </div>

            {/* Thumbnail selector */}
            {product.images && product.images.length > 1 && (
              <div className="flex items-center gap-2.5 sm:gap-3 overflow-x-auto pb-1" aria-label="Product thumbnail gallery">
                {product.images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedImageIndex(idx);
                      setImageError(false);
                    }}
                    aria-label={`View image ${idx + 1}`}
                    className={`relative w-14 h-18 sm:w-16 sm:h-20 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                      selectedImageIndex === idx
                        ? 'border-axdoro-charcoal scale-105 shadow-subtle'
                        : 'border-axdoro-border opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt={`View angle ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Specifications & Selections */}
          <div className="flex-1 min-h-0 p-5 sm:p-6 md:p-8 flex flex-col justify-between space-y-6 md:overflow-y-auto">
            <div>
              <span className="text-[11px] font-mono tracking-widest text-axdoro-accent-muted uppercase block font-semibold mb-1 pr-10">
                {product.categoryLabel || product.category.name}
              </span>
              <h2 id="product-modal-title" className="text-2xl sm:text-3xl font-extrabold text-axdoro-charcoal tracking-tight pr-10">
                {product.name}
              </h2>

              {/* Price Row */}
              <div className="flex items-baseline gap-3 mt-3">
                <span className="text-2xl font-black text-axdoro-charcoal">&#8377;{activePrice}</span>
                {activeOriginalPrice && (
                  <>
                    <span className="text-sm text-axdoro-text-muted line-through">
                      &#8377;{activeOriginalPrice}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-axdoro-surface border border-axdoro-border-strong text-axdoro-charcoal text-xs font-bold">
                      {discountPercent}% OFF
                    </span>
                  </>
                )}
              </div>

              {/* Description */}
              <p className="text-xs sm:text-sm text-axdoro-text-muted mt-4 leading-relaxed">
                {product.description}
              </p>

              {/* Size Selector */}
              {product.sizes && product.sizes.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider">
                      Select Size <span className="text-red-500">*</span>
                    </label>
                    {sizeError && (
                      <span className="text-[11px] text-red-600 font-semibold flex items-center gap-1" role="alert">
                        <AlertCircle className="w-3.5 h-3.5" /> Please choose a size
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Available sizes">
                    {product.sizes.map((size) => {
                      // Check variant stock for this size if variant data is populated
                      const variantForSize = product.variants?.find(
                        (v) => v.size === size && (!selectedColor || v.color === selectedColor)
                      );
                      const isSizeOutOfStock = variantForSize !== undefined && (variantForSize.stock <= 0 || !variantForSize.isActive);

                      return (
                        <button
                          key={size}
                          type="button"
                          role="radio"
                          aria-checked={selectedSize === size}
                          disabled={isSizeOutOfStock}
                          onClick={() => {
                            setSelectedSize(size);
                            setSizeError(false);
                          }}
                          className={`min-w-12 h-10 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                            isSizeOutOfStock
                              ? 'bg-stone-100 border border-stone-200 text-stone-400 line-through cursor-not-allowed opacity-50'
                              : selectedSize === size
                              ? 'bg-axdoro-charcoal text-white border-2 border-axdoro-charcoal shadow-subtle'
                              : sizeError
                              ? 'bg-axdoro-surface border-2 border-red-500/80 text-axdoro-charcoal hover:border-red-600'
                              : 'bg-axdoro-surface border border-axdoro-border text-axdoro-charcoal hover:border-axdoro-charcoal'
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Colour Selector */}
              {product.colors && product.colors.length > 0 && (
                <div className="mt-5">
                  <label className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider block mb-2">
                    Color: <span className="text-axdoro-accent-muted font-semibold">{selectedColor}</span>
                  </label>
                  <div className="flex items-center gap-2.5" role="radiogroup" aria-label="Available colors">
                    {product.colors.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        role="radio"
                        aria-checked={selectedColor === c.name}
                        onClick={() => setSelectedColor(c.name)}
                        title={c.name}
                        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                          selectedColor === c.name
                            ? 'border-axdoro-charcoal scale-110 shadow-subtle'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {selectedColor === c.name && (
                          <Check className={`w-3.5 h-3.5 ${c.hex.toLowerCase() === '#faf6fc' || c.hex.toLowerCase() === '#ffffff' ? 'text-black' : 'text-white'}`} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock Status Communication */}
              <div className="mt-5 text-xs">
                {isEntirelyOutOfStock ? (
                  <span className="text-red-700 font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> This product is currently out of stock.
                  </span>
                ) : isSelectedVariantOutOfStock ? (
                  <span className="text-red-700 font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> Selected size ({selectedSize}) is out of stock. Please pick another size.
                  </span>
                ) : matchingVariant && matchingVariant.stock <= 5 ? (
                  <span className="text-amber-800 font-medium">
                    Only {matchingVariant.stock} left in stock for size {selectedSize}.
                  </span>
                ) : product.stockCount <= 5 ? (
                  <span className="text-amber-800 font-medium">
                    Only {product.stockCount} left in stock.
                  </span>
                ) : (
                  <span className="text-emerald-700 font-medium">
                    In Stock &bull; Ready for dispatch
                  </span>
                )}
              </div>

              {/* Quantity Controls */}
              {!isEntirelyOutOfStock && !isSelectedVariantOutOfStock && (
                <div className="mt-5 flex items-center gap-4">
                  <label className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider">
                    Quantity
                  </label>
                  <div className="flex items-center rounded-lg border border-axdoro-border bg-axdoro-bg">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={quantity <= 1}
                      className="p-2 text-axdoro-text-muted hover:text-axdoro-charcoal disabled:opacity-30 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-axdoro-accent"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-10 text-center font-bold text-xs text-axdoro-charcoal">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.min(maxAvailableQuantity, quantity + 1))}
                      disabled={quantity >= maxAvailableQuantity}
                      className="p-2 text-axdoro-text-muted hover:text-axdoro-charcoal disabled:opacity-30 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-axdoro-accent"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {maxAvailableQuantity < 10 && (
                    <span className="text-[11px] text-axdoro-text-muted">
                      (Max {maxAvailableQuantity} available)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Actions & Bulk CTA */}
            <div className="space-y-3 pt-6 border-t border-axdoro-border">
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={isEntirelyOutOfStock || isSelectedVariantOutOfStock}
                className={`w-full py-3.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                  isEntirelyOutOfStock || isSelectedVariantOutOfStock
                    ? 'bg-stone-200 text-stone-500 cursor-not-allowed shadow-none'
                    : addedSuccess
                    ? 'bg-emerald-700 text-white'
                    : 'bg-axdoro-charcoal hover:bg-black text-white'
                }`}
              >
                {isEntirelyOutOfStock || isSelectedVariantOutOfStock ? (
                  <span>Out of Stock</span>
                ) : addedSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Added to Bag!</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>Add to Bag &bull; &#8377;{activePrice * quantity}</span>
                  </>
                )}
              </button>

              {/* Bulk Prompt Block */}
              <div className="rounded-xl border border-axdoro-border bg-axdoro-bg p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4 text-axdoro-accent-muted flex-shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-axdoro-charcoal block">
                      Need custom branding or team quantities?
                    </span>
                    <span className="text-[11px] text-axdoro-text-muted">
                      Direct manufacturer volume pricing with sample approval.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenBulkWithProduct(product);
                  }}
                  className="px-3 py-1.5 rounded-md bg-axdoro-surface border border-axdoro-border hover:bg-axdoro-charcoal hover:text-white text-axdoro-charcoal text-xs font-semibold transition-colors flex-shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                >
                  Bulk Enquiry
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
