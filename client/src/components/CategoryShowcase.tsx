import React from 'react';
import { ProductCategory, Category } from '../types/product.ts';
import { ArrowRight, Clock } from 'lucide-react';

interface CategoryShowcaseProps {
  activeCategory: ProductCategory | 'all';
  onSelectCategory: (category: ProductCategory | 'all') => void;
  onScrollToShop: () => void;
  categories?: Category[];
  onNavigate?: (path: string) => void;
}

const DEFAULT_CATEGORY_IMAGES: Record<string, string> = {
  't-shirts': 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80',
  'shirts': 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&auto=format&fit=crop&q=80',
};

const GENERIC_CATEGORY_IMAGE =
  'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800&auto=format&fit=crop&q=80';

export const CategoryShowcase: React.FC<CategoryShowcaseProps> = ({
  activeCategory,
  onSelectCategory,
  onScrollToShop,
  categories = [],
  onNavigate,
}) => {
  return (
    <section className="py-16 border-b border-axdoro-border bg-axdoro-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <span className="text-xs font-mono text-axdoro-accent-muted uppercase tracking-widest block mb-2 font-semibold">
              Curated Collections
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-axdoro-charcoal tracking-tight">
              Explore Primary Categories
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-axdoro-text-muted max-w-md leading-relaxed">
            Our collection centers on premium combed cotton and tailored garments, engineered for individual comfort and bespoke bulk requirements.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {categories.length === 0 ? (
            <>
              {/* Category Card 1: T-Shirts */}
              <button
                type="button"
                onClick={() => {
                  if (onNavigate) {
                    onNavigate('/category/t-shirts');
                  } else {
                    onSelectCategory('t-shirts');
                    onScrollToShop();
                  }
                }}
                aria-label="View T-Shirts Collection"
                className={`group relative rounded-xl overflow-hidden border p-6 flex flex-col justify-between h-80 transition-all cursor-pointer text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                  activeCategory === 't-shirts'
                    ? 'border-axdoro-charcoal bg-axdoro-surface shadow-card'
                    : 'border-axdoro-border bg-axdoro-surface hover:border-axdoro-border-strong shadow-subtle'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 z-10 pointer-events-none"></div>
                <img
                  src="https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80"
                  alt="T-Shirts Category"
                  width={800}
                  height={600}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 opacity-60 group-hover:opacity-75"
                />
                <div className="relative z-20">
                  <span className="inline-block px-2.5 py-1 rounded bg-white/20 backdrop-blur-sm text-white text-[10px] font-mono font-bold uppercase tracking-wider mb-2 border border-white/20">
                    140 GSM Available
                  </span>
                  <h3 className="text-2xl font-bold text-white transition-colors">
                    T-Shirts
                  </h3>
                </div>
                <div className="relative z-20 space-y-3">
                  <p className="text-xs text-zinc-200 line-clamp-2">
                    Comfortable and versatile options suitable for everyday wear and bulk requirements.
                  </p>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white group-hover:translate-x-0.5 transition-transform">
                    <span>View Collection</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>

              {/* Category Card 2: Shirts */}
              <button
                type="button"
                onClick={() => {
                  if (onNavigate) {
                    onNavigate('/category/shirts');
                  } else {
                    onSelectCategory('shirts');
                    onScrollToShop();
                  }
                }}
                aria-label="View Shirts Collection"
                className={`group relative rounded-xl overflow-hidden border p-6 flex flex-col justify-between h-80 transition-all cursor-pointer text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                  activeCategory === 'shirts'
                    ? 'border-axdoro-charcoal bg-axdoro-surface shadow-card'
                    : 'border-axdoro-border bg-axdoro-surface hover:border-axdoro-border-strong shadow-subtle'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 z-10 pointer-events-none"></div>
                <img
                  src="https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&auto=format&fit=crop&q=80"
                  alt="Shirts Category"
                  width={800}
                  height={600}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 opacity-60 group-hover:opacity-75"
                />
                <div className="relative z-20">
                  <span className="inline-block px-2.5 py-1 rounded bg-white/20 backdrop-blur-sm text-white text-[10px] font-mono font-bold uppercase tracking-wider mb-2 border border-white/20">
                    Oxford &bull; Linen &bull; Twill
                  </span>
                  <h3 className="text-2xl font-bold text-white transition-colors">
                    Shirts
                  </h3>
                </div>
                <div className="relative z-20 space-y-3">
                  <p className="text-xs text-zinc-200 line-clamp-2">
                    Smart and practical clothing options for different occasions and corporate requirements.
                  </p>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white group-hover:translate-x-0.5 transition-transform">
                    <span>View Collection</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            </>
          ) : (
            categories.map((cat) => {
              const isSelected = activeCategory === cat.slug;
              const bgImage = DEFAULT_CATEGORY_IMAGES[cat.slug] || GENERIC_CATEGORY_IMAGE;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate(`/category/${cat.slug}`);
                    } else {
                      onSelectCategory(cat.slug);
                      onScrollToShop();
                    }
                  }}
                  aria-label={
                    cat.slug === 't-shirts'
                      ? 'View T-Shirts Collection'
                      : cat.slug === 'shirts'
                      ? 'View Shirts Collection'
                      : `View ${cat.name} Collection`
                  }
                  className={`group relative rounded-xl overflow-hidden border p-6 flex flex-col justify-between h-80 transition-all cursor-pointer text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                    isSelected
                      ? 'border-axdoro-charcoal bg-axdoro-surface shadow-card'
                      : 'border-axdoro-border bg-axdoro-surface hover:border-axdoro-border-strong shadow-subtle'
                  }`}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 z-10 pointer-events-none"></div>
                  <img
                    src={bgImage}
                    alt={`${cat.name} Category`}
                    width={800}
                    height={600}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 opacity-60 group-hover:opacity-75"
                  />
                  <div className="relative z-20">
                    <span className="inline-block px-2.5 py-1 rounded bg-white/20 backdrop-blur-sm text-white text-[10px] font-mono font-bold uppercase tracking-wider mb-2 border border-white/20">
                      {cat.slug === 't-shirts' ? '140 GSM Available' : 'Collection'}
                    </span>
                    <h3 className="text-2xl font-bold text-white transition-colors">
                      {cat.name}
                    </h3>
                  </div>
                  <div className="relative z-20 space-y-3">
                    <p className="text-xs text-zinc-200 line-clamp-2">
                      {cat.description || `Quality ${cat.name.toLowerCase()} engineered for modern comfort and durability.`}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white group-hover:translate-x-0.5 transition-transform">
                      <span>View Collection</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </button>
              );
            })
          )}

          {/* Category Roadmap Card (Shown if fewer than 3 categories) */}
          {(categories.length === 0 || categories.length <= 2) && (
            <div className="relative rounded-xl overflow-hidden border border-dashed border-axdoro-border-strong bg-axdoro-surface p-6 flex flex-col justify-between h-80 shadow-subtle">
              <div>
                <div className="w-10 h-10 rounded-lg bg-axdoro-surface-muted flex items-center justify-center text-axdoro-charcoal mb-4 border border-axdoro-border">
                  <Clock className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono tracking-wider text-axdoro-accent-muted uppercase font-semibold">
                  Brand Roadmap
                </span>
                <h3 className="text-xl font-bold text-axdoro-charcoal mt-1">
                  More Categories Coming Soon
                </h3>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-axdoro-text-muted leading-relaxed">
                  The collection will expand to include tailored trousers, outerwear, and custom apparel as the brand grows.
                </p>
                <span className="inline-block text-[11px] font-semibold text-axdoro-accent-muted">
                  Stay Tuned &bull; Seasonal Expansion
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
