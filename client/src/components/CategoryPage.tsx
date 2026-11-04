import React, { useState, useEffect } from 'react';
import { Product, Category, SortOption } from '../types/product.ts';
import { fetchCategoryBySlug, fetchProducts, fetchHomepageCategorySections } from '../api/catalogue.ts';
import {
  ChevronRight,
  ArrowLeft,
  SlidersHorizontal,
  Layers,
  AlertCircle,
  Loader2,
  FolderTree,
  ImageOff,
} from 'lucide-react';
import { Button } from './ui/button.tsx';
import { sortProductSizes } from '../utils/sizes.ts';

interface CategoryPageProps {
  slug: string;
  onNavigate: (path: string) => void;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size: string, color: string) => void;
  onOpenBulk: () => void;
  posterImageUrl?: string | null;
}

export const CategoryPage: React.FC<CategoryPageProps> = ({
  slug,
  onNavigate,
  onQuickView,
  onAddToCart: _onAddToCart,
  onOpenBulk,
  posterImageUrl: initialPosterImageUrl,
}) => {
  const [category, setCategory] = useState<Category | null>(null);
  const [posterImageUrl, setPosterImageUrl] = useState<string | null>(initialPosterImageUrl || null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('featured');

  // Keep posterImageUrl synchronized if parent passes an updated prop
  useEffect(() => {
    if (initialPosterImageUrl) {
      setPosterImageUrl(initialPosterImageUrl);
    }
  }, [initialPosterImageUrl]);

  // Load category, promotional section banner, and products
  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setIsNotFound(false);
    setError(null);

    async function loadData() {
      try {
        // 1. Fetch category metadata & homepage category sections concurrently
        const [catRes, sectionsRes] = await Promise.allSettled([
          fetchCategoryBySlug(slug),
          fetchHomepageCategorySections(),
        ]);

        if (!isCurrent) return;

        if (catRes.status === 'fulfilled') {
          const cat = catRes.value;
          setCategory(cat);
          document.title = `${cat.name} — AXDORO`;
        } else {
          const msg = catRes.reason instanceof Error ? catRes.reason.message : String(catRes.reason);
          if (msg.includes('not found') || msg.includes('404')) {
            setIsNotFound(true);
            document.title = 'Category Not Found — AXDORO';
            return;
          } else {
            setError(msg);
            return;
          }
        }

        if (sectionsRes.status === 'fulfilled') {
          const matchingSec = sectionsRes.value.find((s) => s.category?.slug === slug);
          if (matchingSec?.posterImageUrl) {
            setPosterImageUrl(matchingSec.posterImageUrl);
          }
        }

        // 2. Fetch products strictly belonging to this category
        const response = await fetchProducts({
          category: slug,
          sort: sortOption,
          limit: 50,
        });
        if (!isCurrent) return;
        setProducts(response.products);
      } catch (err: unknown) {
        if (!isCurrent) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found') || msg.includes('404')) {
          setIsNotFound(true);
          document.title = 'Category Not Found — AXDORO';
        } else {
          setError(msg);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isCurrent = false;
    };
  }, [slug, sortOption]);

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 py-24 bg-axdoro-bg">
        <Loader2 className="w-8 h-8 animate-spin text-axdoro-accent" />
        <span className="text-sm font-medium text-axdoro-text-muted">Loading collection...</span>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-20 text-center bg-axdoro-bg">
        <div className="w-16 h-16 rounded-full bg-axdoro-surface-muted flex items-center justify-center text-axdoro-text-muted mb-5 border border-axdoro-border">
          <FolderTree className="w-8 h-8 opacity-60" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-axdoro-charcoal tracking-tight mb-3">
          Category Not Found
        </h1>
        <p className="text-xs sm:text-sm text-axdoro-text-muted max-w-md mx-auto mb-8 leading-relaxed">
          The requested collection <span className="font-mono text-axdoro-accent-muted">/category/{slug}</span> does not exist or is currently inactive.
        </p>
        <Button
          onClick={() => onNavigate('/')}
          className="flex items-center gap-2 px-6 py-2.5 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Storefront</span>
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-20 text-center bg-axdoro-bg">
        <AlertCircle className="w-12 h-12 text-red-600 mb-4" />
        <h2 className="text-xl font-bold text-axdoro-charcoal mb-2">Unable to Load Category</h2>
        <p className="text-xs text-axdoro-text-muted max-w-md mx-auto mb-6">{error}</p>
        <Button
          onClick={() => window.location.reload()}
          variant="outline"
          className="text-xs"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-axdoro-bg min-h-screen">
      {/* Breadcrumb Header */}
      <div className="border-b border-axdoro-border bg-axdoro-surface/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-axdoro-text-muted">
            <button
              onClick={() => onNavigate('/')}
              className="hover:text-axdoro-charcoal transition-colors cursor-pointer flex items-center gap-1 font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Storefront</span>
            </button>
            <ChevronRight className="w-3 h-3 text-axdoro-border-strong" />
            <span className="text-axdoro-charcoal font-semibold">{category?.name}</span>
          </nav>
        </div>
      </div>

      {/* Category Hero Banner (Sleek Horizontal Fashion Banner) */}
      <section
        role="region"
        aria-label={`${category?.name || 'Category'} Collection Banner`}
        className="relative w-full h-44 sm:h-56 md:h-64 overflow-hidden bg-neutral-900 border-b border-axdoro-border flex items-center"
      >
        {/* Background Image: Promotional Poster Banner Image > Category Image > Ambient Fallback */}
        <img
          src={posterImageUrl || initialPosterImageUrl || category?.imageUrl || '/hero-bg.jpg'}
          alt={category?.name || 'Category Banner'}
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="eager"
        />

        {/* Soft, Transparent Vignette Behind Text Only — Image Remains Bright & Clear */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/25 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

        {/* Banner Content Container */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex flex-col justify-end">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black uppercase text-white tracking-tight leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
            {category?.name || slug}
          </h1>

          {category?.description && (
            <p className="text-xs sm:text-sm text-white/95 font-medium max-w-2xl mt-1.5 sm:mt-2 line-clamp-2 leading-relaxed drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">
              {category.description}
            </p>
          )}
        </div>
      </section>

      {/* Category Controls & Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Sort Bar */}
        <div className="bg-axdoro-surface border border-axdoro-border rounded-xl p-4 mb-8 flex items-center justify-end gap-4 shadow-subtle">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-axdoro-text-muted flex-shrink-0" />
            <span className="text-xs text-axdoro-text-muted font-medium hidden sm:inline">Sort:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              aria-label="Sort category products"
              className="bg-axdoro-bg border border-axdoro-border rounded-lg px-3 py-2 text-xs font-semibold text-axdoro-charcoal focus:outline-none focus:ring-2 focus:ring-axdoro-accent cursor-pointer"
            >
              <option value="featured">Featured First</option>
              <option value="newest">Newest Arrivals</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
          </div>
        </div>

        {/* Product Grid */}
        {products.length === 0 ? (
          <div className="bg-axdoro-surface border border-axdoro-border rounded-2xl p-12 text-center shadow-subtle my-8">
            <FolderTree className="w-12 h-12 text-axdoro-text-muted/40 mx-auto mb-3" />
            <h3 className="text-base font-bold text-axdoro-charcoal mb-1">
              No products found in this category
            </h3>
            <p className="text-xs text-axdoro-text-muted max-w-md mx-auto mb-6">
              New garments are currently being tailored for this collection.
            </p>
            <Button
              onClick={() => onNavigate('/')}
              size="sm"
              className="text-xs"
            >
              Explore Other Collections
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {products.map((product) => {
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
                        {product.category?.name || category?.name || slug}
                      </span>
                      <h4 className="font-semibold text-xs sm:text-sm text-neutral-900 group-hover:text-axdoro-purple transition-colors line-clamp-1 mt-0.5">
                        {product.name}
                      </h4>
                    </div>

                    {/* Sizes preview if available */}
                    {product.sizes && product.sizes.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {sortProductSizes(product.sizes).slice(0, 4).map((s) => (
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

        {/* Bulk Order Banner */}
        <div className="mt-16 bg-axdoro-surface border border-axdoro-border rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-subtle">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-axdoro-accent" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-axdoro-accent font-bold">
                Corporate &amp; Team Orders
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-axdoro-charcoal">
              Need custom {category?.name.toLowerCase()} for your team or organization?
            </h3>
            <p className="text-xs text-axdoro-text-muted">
              We offer bespoke bulk manufacturing with custom GSMs, weave selections, and tailored branding.
            </p>
          </div>
          <Button
            onClick={onOpenBulk}
            className="text-xs font-semibold px-5 py-2.5 flex-shrink-0"
          >
            Submit Bulk Enquiry
          </Button>
        </div>
      </div>
    </div>
  );
};
