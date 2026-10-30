import React, { useState, useEffect } from 'react';
import { Product, CategoryShortcutItem } from '../types/product.ts';
import { fetchProducts } from '../api/catalogue.ts';
import { ArrowRight, ImageOff } from 'lucide-react';

export interface CategorySectionBlockProps {
  id?: string;
  categorySlug: 'pants' | 'shirts' | 't-shirts';
  title: string;
  subtitle?: string;
  bannerImage?: string;
  bannerTitle?: string;
  bannerSubtitle?: string;
  shortcuts?: (string | CategoryShortcutItem)[];
  viewAllLink: string;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size: string, color: string) => void;
  onNavigate?: (path: string) => void;
}

const DEFAULT_CATEGORY_FALLBACKS: Record<string, string> = {
  't-shirts': 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80',
  'shirts': 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
  'pants': 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80',
};

interface NormalizedShortcutItem {
  id: string;
  label: string;
  sublabel?: string;
  imageUrl: string;
  query: string;
}

export const CategorySectionBlock: React.FC<CategorySectionBlockProps> = ({
  id,
  categorySlug,
  title,
  subtitle,
  bannerImage,
  bannerTitle,
  bannerSubtitle,
  shortcuts = [],
  viewAllLink,
  onQuickView,
  onNavigate,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeShortcut, setActiveShortcut] = useState<string | null>(null);

  const normalizedShortcuts: NormalizedShortcutItem[] = React.useMemo(() => {
    return shortcuts.map((sc, idx) => {
      if (typeof sc === 'string') {
        return {
          id: `sc-${idx}-${sc.toLowerCase().replace(/\s+/g, '-')}`,
          label: sc,
          imageUrl: DEFAULT_CATEGORY_FALLBACKS[categorySlug] || DEFAULT_CATEGORY_FALLBACKS['pants'],
          query: sc,
        };
      }
      return {
        id: sc.id || `sc-${idx}-${sc.label.toLowerCase().replace(/\s+/g, '-')}`,
        label: sc.label,
        sublabel: sc.sublabel,
        imageUrl: sc.imageUrl || DEFAULT_CATEGORY_FALLBACKS[categorySlug] || DEFAULT_CATEGORY_FALLBACKS['pants'],
        query: sc.query || (sc.sublabel ? `${sc.label} ${sc.sublabel}` : sc.label),
      };
    });
  }, [shortcuts, categorySlug]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetchProducts({ category: categorySlug, limit: 8 })
      .then((res) => {
        if (isMounted) {
          setProducts(res.products || []);
        }
      })
      .catch((err) => {
        console.warn(`[CategorySectionBlock] Failed to load products for '${categorySlug}':`, err);
        if (isMounted) {
          setProducts([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [categorySlug]);

  // Gracefully filter products if an active shortcut matches title or description
  const displayedProducts = React.useMemo(() => {
    if (!activeShortcut) {
      return products.slice(0, 4);
    }
    const term = activeShortcut.toLowerCase();
    const filtered = products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.description && p.description.toLowerCase().includes(term))
    );
    // If filter matches real products, show up to 4; otherwise fallback to general products without fabricating
    return (filtered.length > 0 ? filtered : products).slice(0, 4);
  }, [products, activeShortcut]);

  const handleShortcutClick = (query: string) => {
    if (activeShortcut === query) {
      setActiveShortcut(null);
    } else {
      setActiveShortcut(query);
    }
  };

  const handleViewAll = () => {
    if (onNavigate) {
      onNavigate(viewAllLink);
    } else {
      window.location.href = viewAllLink;
    }
  };

  return (
    <section id={id} className="py-10 sm:py-14 bg-[#FAF9F6] text-neutral-900 border-b border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-6 text-center sm:text-left flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 uppercase">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-neutral-500 mt-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Category Shortcuts Strip (Portrait Image Cards with Horizontal Scrolling) */}
        {normalizedShortcuts.length > 0 && (
          <div className="mb-8 -mx-4 px-4 sm:mx-0 sm:px-0">
            <div
              role="region"
              aria-label={`${title} Category Shortcuts`}
              className="flex items-center gap-3 sm:gap-4 overflow-x-auto scrollbar-none pb-2 pt-1 snap-x snap-mandatory"
            >
              {normalizedShortcuts.map((item) => {
                const isActive = activeShortcut === item.query;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleShortcutClick(item.query)}
                    aria-pressed={isActive}
                    aria-label={`${item.label}${item.sublabel ? ` ${item.sublabel}` : ''} filter`}
                    className={`group relative flex-shrink-0 w-28 sm:w-36 md:w-40 aspect-[3/4] rounded-xl overflow-hidden cursor-pointer text-left snap-start transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ${
                      isActive
                        ? 'ring-2 ring-neutral-900 ring-offset-2 shadow-md'
                        : 'border border-neutral-200/80 hover:border-neutral-400 hover:shadow-sm'
                    }`}
                  >
                    {/* Card Background Image */}
                    <img
                      src={item.imageUrl}
                      alt={item.label}
                      loading="lazy"
                      onError={(e) => {
                        const target = e.currentTarget;
                        const fallback =
                          DEFAULT_CATEGORY_FALLBACKS[categorySlug] || DEFAULT_CATEGORY_FALLBACKS['pants'];
                        if (target.src !== fallback) {
                          target.src = fallback;
                        }
                      }}
                      className="w-full h-full object-cover object-center motion-safe:group-hover:scale-105 motion-reduce:transform-none transition-transform duration-500 ease-out"
                    />

                    {/* Dark Gradient Overlay for Legibility */}
                    <div
                      className={`absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent transition-opacity duration-300 ${
                        isActive ? 'opacity-95' : 'opacity-80 group-hover:opacity-90'
                      }`}
                    />

                    {/* Active Pill / Indicator Tag */}
                    {isActive && (
                      <div className="absolute top-2.5 right-2.5 z-10">
                        <span className="inline-block w-2 h-2 rounded-full bg-white shadow" />
                      </div>
                    )}

                    {/* Text Overlay at Bottom */}
                    <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3 z-10 flex flex-col justify-end">
                      <span className="text-xs sm:text-sm font-extrabold uppercase text-white tracking-tight leading-tight block drop-shadow">
                        {item.label}
                      </span>
                      {item.sublabel && (
                        <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest text-neutral-300 block drop-shadow mt-0.5">
                          {item.sublabel}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Editorial Feature Banner if provided (Full Viewport Width, Edge-to-Edge) */}
      {bannerImage && (
        <div className="w-full relative aspect-[16/7] sm:aspect-[21/8] overflow-hidden bg-neutral-900 mb-8 sm:mb-10">
          <img
            src={bannerImage}
            alt={bannerTitle || title}
            className="w-full h-full object-cover object-center"
            loading="lazy"
          />
          {(bannerTitle || bannerSubtitle) && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent flex flex-col justify-end">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-6 sm:pb-8 lg:pb-10 pt-4 text-white">
                {bannerTitle && (
                  <h3 className="text-xl sm:text-3xl font-serif font-bold tracking-tight uppercase">
                    {bannerTitle}
                  </h3>
                )}
                {bannerSubtitle && (
                  <p className="text-xs sm:text-sm text-neutral-200 mt-1 max-w-md">
                    {bannerSubtitle}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Products Carousel / Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse bg-neutral-200 rounded-lg aspect-[3/4]" />
            ))}
          </div>
        ) : displayedProducts.length === 0 ? (
          <div className="py-12 text-center text-neutral-400 text-sm">
            No items currently available in this category.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
            {displayedProducts.map((product) => {
              const discountPercent = product.originalPrice
                ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
                : 0;

              return (
                <article
                  key={product.id}
                  onClick={() => onQuickView(product)}
                  className="group bg-white rounded-lg overflow-hidden border border-neutral-200 hover:border-neutral-400 transition-all cursor-pointer flex flex-col justify-between"
                >
                  {/* Product Image */}
                  <div className="relative aspect-[3/4] bg-neutral-100 overflow-hidden">
                    {product.images && product.images.length > 0 ? (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        loading="lazy"
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 p-2 text-center">
                        <ImageOff className="w-6 h-6 mb-1" />
                        <span className="text-[10px]">No Image</span>
                      </div>
                    )}

                    {/* Subtle Discount Pill */}
                    {discountPercent > 0 && (
                      <div className="absolute top-2 left-2 z-10">
                        <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold tracking-wide">
                          {discountPercent}% OFF
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Product Information */}
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-mono tracking-wider text-neutral-400 uppercase block">
                        {product.category?.name || categorySlug}
                      </span>
                      <h4 className="font-semibold text-xs sm:text-sm text-neutral-900 group-hover:text-axdoro-purple transition-colors line-clamp-1 mt-0.5">
                        {product.name}
                      </h4>
                    </div>

                    {/* Sizes preview if available */}
                    {product.sizes && product.sizes.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {product.sizes.slice(0, 4).map((s) => (
                          <span
                            key={s}
                            className="text-[9px] text-neutral-600 bg-neutral-100 px-1 py-0.5 rounded"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Pricing */}
                    <div className="flex items-baseline gap-1.5 mt-2.5 pt-2 border-t border-neutral-100">
                      <span className="font-bold text-sm text-neutral-900">
                        &#8377;{product.price}
                      </span>
                      {product.originalPrice && (
                        <span className="text-[11px] text-neutral-400 line-through">
                          &#8377;{product.originalPrice}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Centered VIEW ALL Button */}
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={handleViewAll}
            className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest transition-colors shadow-sm cursor-pointer"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
