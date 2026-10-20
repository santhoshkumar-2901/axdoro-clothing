import React, { useState, useEffect, useRef } from 'react';
import { Product, ProductCategory, Category, SortOption } from '../types/product.ts';
import { fetchProducts, ProductsResponse } from '../api/catalogue.ts';
import { ProductCard } from './ProductCard.tsx';
import { Search, SlidersHorizontal, RotateCcw, AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface ProductCatalogueProps {
  selectedCategory: ProductCategory | 'all';
  onSelectCategory: (cat: ProductCategory | 'all') => void;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size: string, color: string) => void;
  categories?: Category[];
}

export const ProductCatalogue: React.FC<ProductCatalogueProps> = ({
  selectedCategory,
  onSelectCategory,
  onQuickView,
  onAddToCart,
  categories = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('featured');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<ProductsResponse['pagination']>({
    page: 1,
    limit: pageSize,
    totalCount: 0,
    totalPages: 1,
    hasMore: false,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input to minimize unnecessary network calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to page 1 on new search
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when category changes
  useEffect(() => {
    setPage(1);
  }, [selectedCategory]);

  // Request race-condition tracking ID
  const activeRequestId = useRef(0);

  const loadProducts = async () => {
    const currentRequestId = ++activeRequestId.current;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchProducts({
        page,
        limit: pageSize,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        search: debouncedSearch,
        sort: sortOption,
      });

      // Avoid stale response race conditions
      if (currentRequestId === activeRequestId.current) {
        setProducts(response.products);
        setPagination(response.pagination);
        setIsLoading(false);
      }
    } catch (err) {
      if (currentRequestId === activeRequestId.current) {
        const message = err instanceof Error ? err.message : 'Failed to connect to catalogue service';
        setError(message);
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, debouncedSearch, sortOption, page]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    onSelectCategory('all');
    setSortOption('featured');
    setPage(1);
  };

  return (
    <section id="shop-section" className="py-16 bg-axdoro-bg border-b border-axdoro-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <span className="text-xs font-mono text-axdoro-accent-muted uppercase tracking-widest block mb-2 font-semibold">
              Official Catalogue
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-axdoro-charcoal tracking-tight">
              Explore the AXDORO Collection
            </h2>
            <p className="text-xs sm:text-sm text-axdoro-text-muted mt-1 max-w-xl leading-relaxed">
              Engineered combed T-shirts (140 GSM) and tailored shirts. Powered by real-time inventory and pricing.
            </p>
          </div>

          <div className="text-xs text-axdoro-text-muted flex items-center gap-2">
            {isLoading ? (
              <span className="inline-flex items-center gap-1.5 text-axdoro-text-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-axdoro-accent-muted" /> Updating catalogue...
              </span>
            ) : (
              <span>
                Showing <strong className="text-axdoro-charcoal font-semibold">{products.length}</strong> of{' '}
                <strong className="text-axdoro-charcoal font-semibold">{pagination.totalCount}</strong> styles
              </span>
            )}
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-axdoro-surface border border-axdoro-border rounded-xl p-4 mb-8 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 shadow-subtle">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Product categories">
            <button
              role="tab"
              aria-selected={selectedCategory === 'all'}
              onClick={() => onSelectCategory('all')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                selectedCategory === 'all'
                  ? 'bg-axdoro-charcoal text-white shadow-subtle'
                  : 'bg-axdoro-surface text-axdoro-text-muted hover:text-axdoro-charcoal border border-axdoro-border hover:bg-axdoro-surface-muted'
              }`}
            >
              All Styles
            </button>
            {categories.length > 0 ? (
              categories.map((cat) => (
                <button
                  key={cat.id}
                  role="tab"
                  aria-selected={selectedCategory === cat.slug}
                  onClick={() => onSelectCategory(cat.slug)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                    selectedCategory === cat.slug
                      ? 'bg-axdoro-charcoal text-white shadow-subtle'
                      : 'bg-axdoro-surface text-axdoro-text-muted hover:text-axdoro-charcoal border border-axdoro-border hover:bg-axdoro-surface-muted'
                  }`}
                >
                  {cat.name}
                </button>
              ))
            ) : (
              <>
                <button
                  role="tab"
                  aria-selected={selectedCategory === 't-shirts'}
                  onClick={() => onSelectCategory('t-shirts')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                    selectedCategory === 't-shirts'
                      ? 'bg-axdoro-charcoal text-white shadow-subtle'
                      : 'bg-axdoro-surface text-axdoro-text-muted hover:text-axdoro-charcoal border border-axdoro-border hover:bg-axdoro-surface-muted'
                  }`}
                >
                  T-Shirts
                </button>
                <button
                  role="tab"
                  aria-selected={selectedCategory === 'shirts'}
                  onClick={() => onSelectCategory('shirts')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                    selectedCategory === 'shirts'
                      ? 'bg-axdoro-charcoal text-white shadow-subtle'
                      : 'bg-axdoro-surface text-axdoro-text-muted hover:text-axdoro-charcoal border border-axdoro-border hover:bg-axdoro-surface-muted'
                  }`}
                >
                  Shirts
                </button>
              </>
            )}
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-axdoro-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search styles, fabric, GSM..."
                aria-label="Search catalogue styles"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-axdoro-bg border border-axdoro-border-strong text-xs text-axdoro-charcoal placeholder-axdoro-text-muted focus:outline-none focus:ring-2 focus:ring-axdoro-accent focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-axdoro-text-muted hover:text-axdoro-charcoal text-xs p-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <SlidersHorizontal className="w-4 h-4 text-axdoro-accent-muted hidden sm:block flex-shrink-0" />
              <select
                value={sortOption}
                onChange={(e) => {
                  setSortOption(e.target.value as SortOption);
                  setPage(1);
                }}
                aria-label="Sort products by"
                className="w-full sm:w-auto px-3 py-2 rounded-lg bg-axdoro-bg border border-axdoro-border-strong text-xs text-axdoro-charcoal focus:outline-none focus:ring-2 focus:ring-axdoro-accent cursor-pointer"
              >
                <option value="featured">Featured First</option>
                <option value="newest">Newest Arrivals</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center max-w-lg mx-auto my-8 shadow-subtle">
            <AlertTriangle className="w-10 h-10 text-red-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-red-900 mb-1">Catalogue Error</h3>
            <p className="text-xs text-red-800 mb-6">{error}</p>
            <button
              onClick={loadProducts}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-axdoro-charcoal text-white text-xs font-semibold hover:bg-black transition-colors shadow-subtle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Connection</span>
            </button>
          </div>
        ) : isLoading ? (
          /* Loading Skeletons */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-xl overflow-hidden bg-axdoro-surface border border-axdoro-border p-4 flex flex-col justify-between animate-pulse shadow-subtle"
              >
                <div className="aspect-[3/4] bg-stone-100 rounded-lg mb-4" />
                <div className="space-y-2">
                  <div className="h-3 bg-stone-200 rounded w-1/3" />
                  <div className="h-4 bg-stone-200 rounded w-3/4" />
                  <div className="h-3 bg-stone-200 rounded w-1/2 pt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length > 0 ? (
          /* Products Grid */
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onQuickView={onQuickView}
                  onAddToCart={onAddToCart}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-3">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="px-3 py-2 rounded-lg border border-axdoro-border bg-axdoro-surface text-xs text-axdoro-charcoal disabled:opacity-30 disabled:cursor-not-allowed hover:bg-axdoro-surface-muted transition-colors flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>
                <span className="text-xs text-axdoro-text-muted font-mono">
                  Page <strong className="text-axdoro-charcoal">{page}</strong> of{' '}
                  <strong className="text-axdoro-charcoal">{pagination.totalPages}</strong>
                </span>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                  className="px-3 py-2 rounded-lg border border-axdoro-border bg-axdoro-surface text-xs text-axdoro-charcoal disabled:opacity-30 disabled:cursor-not-allowed hover:bg-axdoro-surface-muted transition-colors flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          /* Empty State */
          <div className="rounded-2xl border border-axdoro-border bg-axdoro-surface p-12 text-center max-w-md mx-auto my-12 shadow-subtle">
            <div className="w-12 h-12 rounded-full bg-axdoro-surface-muted border border-axdoro-border flex items-center justify-center mx-auto text-axdoro-accent-muted mb-4">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-axdoro-charcoal mb-1">No matching styles found</h3>
            <p className="text-xs text-axdoro-text-muted mb-6">
              {debouncedSearch
                ? `We couldn't find anything matching "${debouncedSearch}". Try adjusting your query.`
                : 'No published products found in this category.'}
            </p>
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-axdoro-charcoal text-white text-xs font-semibold hover:bg-black transition-colors shadow-subtle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
