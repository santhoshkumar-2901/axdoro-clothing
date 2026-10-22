import React, { useState, useEffect } from 'react';
import { Product, Category, SortOption } from '../types/product.ts';
import { fetchCategoryBySlug, fetchProducts } from '../api/catalogue.ts';
import { ProductCard } from './ProductCard.tsx';
import {
  ChevronRight,
  ArrowLeft,
  Search,
  SlidersHorizontal,
  Layers,
  AlertCircle,
  Loader2,
  FolderTree,
} from 'lucide-react';
import { Button } from './ui/button.tsx';
import { Badge } from './ui/badge.tsx';

interface CategoryPageProps {
  slug: string;
  onNavigate: (path: string) => void;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size: string, color: string) => void;
  onOpenBulk: () => void;
}

export const CategoryPage: React.FC<CategoryPageProps> = ({
  slug,
  onNavigate,
  onQuickView,
  onAddToCart,
  onOpenBulk,
}) => {
  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('featured');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load category and products
  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setIsNotFound(false);
    setError(null);

    async function loadData() {
      try {
        // 1. Fetch category metadata
        const cat = await fetchCategoryBySlug(slug);
        if (!isCurrent) return;
        setCategory(cat);
        document.title = `${cat.name} — AXDORO`;

        // 2. Fetch products strictly belonging to this category
        const response = await fetchProducts({
          category: slug,
          sort: sortOption,
          search: debouncedSearch,
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
  }, [slug, sortOption, debouncedSearch]);

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

  // Cover image: category image, falling back to primary product image of first product, or generic brand banner
  const coverImage = category?.imageUrl
    ? category.imageUrl
    : products.length > 0 && products[0].images && products[0].images[0]
    ? products[0].images[0]
    : 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1600&auto=format&fit=crop&q=80';

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

      {/* Editorial Category Hero Banner */}
      <div className="relative border-b border-axdoro-border overflow-hidden bg-axdoro-charcoal text-white">
        <div className="absolute inset-0 z-0">
          <img
            src={coverImage}
            alt={category?.name || 'Category'}
            onError={(e) => {
              const fallback = 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1600&auto=format&fit=crop&q=80';
              if (e.currentTarget.src !== fallback) {
                e.currentTarget.src = fallback;
              }
            }}
            className="w-full h-full object-cover object-center opacity-30 filter blur-sm scale-105 transition-all duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-axdoro-charcoal via-axdoro-charcoal/80 to-axdoro-charcoal/60" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-mono tracking-widest text-axdoro-accent uppercase font-bold px-2 py-0.5 rounded bg-white/10 backdrop-blur-md border border-white/10">
                Collection
              </span>
              <Badge variant="secondary" className="bg-white/20 text-white font-mono text-[11px] border-none">
                {products.length} {products.length === 1 ? 'Style' : 'Styles'} Available
              </Badge>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white">
              {category?.name}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-xl">
              {category?.description ||
                `Explore AXDORO's curated collection of premium ${category?.name.toLowerCase()}. Precision-crafted textiles engineered for individual comfort and bulk durability.`}
            </p>
          </div>
        </div>
      </div>

      {/* Category Controls & Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Search & Sort Bar */}
        <div className="bg-axdoro-surface border border-axdoro-border rounded-xl p-4 mb-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-subtle">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-axdoro-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search within ${category?.name}...`}
              aria-label={`Search within ${category?.name}`}
              className="w-full pl-9 pr-4 py-2 bg-axdoro-bg border border-axdoro-border rounded-lg text-xs text-axdoro-text focus:outline-none focus:ring-2 focus:ring-axdoro-accent focus:border-transparent transition-all placeholder:text-axdoro-text-muted/60"
            />
          </div>

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
              {debouncedSearch
                ? `No styles matched "${debouncedSearch}". Try a different keyword.`
                : 'New garments are currently being tailored for this collection.'}
            </p>
            {debouncedSearch ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="text-xs"
              >
                Clear Search
              </Button>
            ) : (
              <Button
                onClick={() => onNavigate('/')}
                size="sm"
                className="text-xs"
              >
                Explore Other Collections
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onQuickView={onQuickView}
                onAddToCart={onAddToCart}
              />
            ))}
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
