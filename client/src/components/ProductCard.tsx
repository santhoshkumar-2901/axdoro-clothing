import React, { useState } from 'react';
import { Product, ProductVariant } from '../types/product.ts';
import { Eye, ShoppingBag, ImageOff, Check } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size: string, color: string) => void;
}

export interface QuickAddAvailability {
  canAddDirectly: boolean;
  isOutOfStock: boolean;
  needsVariantSelection: boolean;
  selectedSize: string;
  selectedColor: string;
  variant?: ProductVariant;
  reason?: string;
}

export function evaluateQuickAddAvailability(product: Product): QuickAddAvailability {
  // 1. Entire product out of stock
  if (product.stockStatus === 'out-of-stock' || product.stockCount <= 0) {
    return {
      canAddDirectly: false,
      isOutOfStock: true,
      needsVariantSelection: false,
      selectedSize: '',
      selectedColor: '',
      reason: 'Product is out of stock',
    };
  }

  // 2. Authoritative variants present
  if (product.variants && product.variants.length > 0) {
    const activeVariants = product.variants.filter((v) => v.isActive);
    const inStockVariants = activeVariants.filter((v) => v.stock > 0);

    if (inStockVariants.length === 0) {
      return {
        canAddDirectly: false,
        isOutOfStock: true,
        needsVariantSelection: false,
        selectedSize: '',
        selectedColor: '',
        reason: 'All variants are out of stock',
      };
    }

    // Default target: first listed size and first color
    const defaultSize = product.sizes && product.sizes.length > 0 ? product.sizes[0] : inStockVariants[0].size;
    const defaultColor = product.colors && product.colors.length > 0 ? product.colors[0].name : inStockVariants[0].color;

    // Check if the default variant combination is available with stock
    const matchingDefault = inStockVariants.find(
      (v) => v.size === defaultSize && (!defaultColor || v.color === defaultColor)
    );

    if (matchingDefault) {
      // Default variant is in stock
      // If there are multiple sizes, customer should pick via Quick View unless single variant/size
      if (product.sizes && product.sizes.length > 1) {
        return {
          canAddDirectly: false,
          isOutOfStock: false,
          needsVariantSelection: true,
          selectedSize: defaultSize,
          selectedColor: defaultColor,
          variant: matchingDefault,
          reason: 'Multiple sizes available; customer size selection required',
        };
      }

      return {
        canAddDirectly: true,
        isOutOfStock: false,
        needsVariantSelection: false,
        selectedSize: matchingDefault.size,
        selectedColor: matchingDefault.color,
        variant: matchingDefault,
      };
    }

    // Default variant is out of stock, but another variant has stock
    return {
      canAddDirectly: false,
      isOutOfStock: false,
      needsVariantSelection: true,
      selectedSize: inStockVariants[0].size,
      selectedColor: inStockVariants[0].color,
      variant: inStockVariants[0],
      reason: 'Default size is unavailable; customer selection required',
    };
  }

  // 3. Variants array not provided (e.g. catalogue summary DTO where only aggregated stockCount exists)
  // If multiple sizes exist, we cannot safely know which size is in stock without full variant data
  if (product.sizes && product.sizes.length > 1) {
    return {
      canAddDirectly: false,
      isOutOfStock: false,
      needsVariantSelection: true,
      selectedSize: product.sizes[0] || 'M',
      selectedColor: product.colors[0]?.name || 'Standard',
      reason: 'Variant stock unverified; customer size selection required in quick view',
    };
  }

  // Single size or no sizes listed, and product has positive stockCount
  const defaultSize = product.sizes[0] || 'Standard';
  const defaultColor = product.colors[0]?.name || 'Standard';

  return {
    canAddDirectly: true,
    isOutOfStock: false,
    needsVariantSelection: false,
    selectedSize: defaultSize,
    selectedColor: defaultColor,
  };
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onQuickView,
  onAddToCart,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [addedQuick, setAddedQuick] = useState(false);

  const discountPercent = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  const availability = evaluateQuickAddAvailability(product);
  const isOutOfStock = availability.isOutOfStock;

  const quickAddAriaLabel = isOutOfStock
    ? `${product.name} is out of stock`
    : availability.needsVariantSelection
    ? `Select size for ${product.name}`
    : `Add ${product.name} to bag`;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Guard: Zero-stock or unavailable product cannot be added
    if (availability.isOutOfStock) {
      return;
    }

    // Direct addition only when verified variant or single size is available
    if (availability.canAddDirectly) {
      onAddToCart(product, availability.selectedSize, availability.selectedColor);
      setAddedQuick(true);
      setTimeout(() => setAddedQuick(false), 1500);
      return;
    }

    // If multiple sizes exist or variant-level stock requires customer selection,
    // safely route to Quick View so customer explicitly chooses an available variant
    onQuickView(product);
  };

  return (
    <article
      className="group relative rounded-xl overflow-hidden bg-axdoro-surface border border-axdoro-border hover:border-axdoro-border-strong transition-all duration-300 flex flex-col justify-between shadow-subtle hover:shadow-card"
    >
      {/* Top Image Container */}
      <div className="relative aspect-[3/4] overflow-hidden bg-stone-100">
        {/* Semantic Image Action Button (Fix B: Keyboard Accessible, No Nested Buttons) */}
        <button
          type="button"
          onClick={() => onQuickView(product)}
          aria-label={`View details for ${product.name}`}
          className="w-full h-full block text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded-t-xl"
        >
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 bg-axdoro-surface-muted animate-pulse" />
          )}

          {imageError || !product.images || product.images.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-axdoro-surface-muted text-axdoro-text-muted text-xs">
              <ImageOff className="w-8 h-8 text-stone-400 mb-1.5" />
              <span className="font-medium text-axdoro-charcoal">Image Unavailable</span>
              <span className="text-[11px] text-axdoro-text-muted mt-0.5 line-clamp-1">{product.name}</span>
            </div>
          ) : (
            <img
              src={product.images[0]}
              alt={product.name}
              width={600}
              height={800}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover object-center group-hover:scale-[1.03] transition-transform duration-500"
            />
          )}
        </button>

        {/* Badges Overlay (Sibling to image button at z-10) */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 z-10 pointer-events-none">
          {product.fabricSpec && (
            <span className="px-2 py-0.5 rounded bg-axdoro-surface/90 border border-axdoro-accent/60 text-axdoro-accent-muted text-[10px] font-mono font-bold tracking-wider shadow-subtle backdrop-blur-sm">
              {product.fabricSpec}
            </span>
          )}
          {product.isNewArrival && (
            <span className="px-2 py-0.5 rounded bg-axdoro-charcoal text-white text-[10px] font-bold tracking-wider uppercase shadow-subtle">
              New
            </span>
          )}
          {discountPercent > 0 && (
            <span className="px-2 py-0.5 rounded bg-axdoro-surface border border-axdoro-border-strong text-axdoro-charcoal text-[10px] font-bold tracking-wider shadow-subtle">
              {discountPercent}% OFF
            </span>
          )}
        </div>

        {/* Action Buttons Overlay (Sibling to image button at z-10) */}
        <div className="absolute inset-x-2.5 bottom-2.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 z-10 flex gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickView(product);
            }}
            aria-label={`Quick view ${product.name}`}
            className="flex-1 py-2 px-3 rounded-lg bg-axdoro-surface/95 backdrop-blur-md border border-axdoro-border text-axdoro-charcoal text-xs font-semibold hover:bg-axdoro-purple hover:text-white hover:border-axdoro-border-strong transition-colors flex items-center justify-center gap-1.5 shadow-subtle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Quick View</span>
          </button>
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={isOutOfStock}
            title={quickAddAriaLabel}
            aria-label={quickAddAriaLabel}
            className={`p-2 rounded-lg transition-colors shadow-subtle flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
              isOutOfStock
                ? 'bg-stone-200 text-stone-400 cursor-not-allowed opacity-50 shadow-none hover:bg-stone-200'
                : addedQuick
                ? 'bg-emerald-700 text-white cursor-default'
                : 'bg-axdoro-charcoal hover:bg-black text-white cursor-pointer'
            }`}
          >
            {addedQuick ? <Check className="w-4 h-4 text-white" /> : <ShoppingBag className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Product Details Section */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <span className="text-[10px] font-mono tracking-widest text-axdoro-accent-muted uppercase block font-semibold">
            {product.categoryLabel || product.category.name}
          </span>
          <button
            type="button"
            onClick={() => onQuickView(product)}
            className="text-left font-bold text-sm text-axdoro-charcoal hover:text-axdoro-accent-muted transition-colors mt-0.5 line-clamp-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-axdoro-accent rounded"
          >
            {product.name}
          </button>
        </div>

        {/* Sizing Preview Pills */}
        <div className="flex items-center gap-1 mt-2.5 flex-wrap">
          {product.sizes.map((s) => (
            <span
              key={s}
              className="text-[10px] font-medium text-axdoro-text-muted bg-axdoro-bg px-1.5 py-0.5 rounded border border-axdoro-border"
            >
              {s}
            </span>
          ))}
        </div>

        {/* Price & Stock Status */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-axdoro-border">
          <div className="flex items-baseline gap-2">
            <span className="font-extrabold text-base text-axdoro-charcoal">
              &#8377;{product.price}
            </span>
            {product.originalPrice && (
              <span className="text-xs text-axdoro-text-muted line-through">
                &#8377;{product.originalPrice}
              </span>
            )}
          </div>
          {product.stockStatus === 'low-stock' ? (
            <span className="text-[11px] text-amber-700 font-medium">
              Only {product.stockCount} left
            </span>
          ) : product.stockStatus === 'out-of-stock' ? (
            <span className="text-[11px] text-stone-500 font-medium">
              Out of Stock
            </span>
          ) : (
            <span className="text-[11px] text-emerald-700 font-medium">
              In Stock
            </span>
          )}
        </div>
      </div>
    </article>
  );
};
