import React, { useState, useEffect, useRef } from 'react';
import { ShoppingBag, Menu, X, Layers, Search, ChevronRight, Loader2 } from 'lucide-react';
import { ProductCategory, Category, Product } from '../types/product.ts';
import { fetchProducts } from '../api/catalogue.ts';
import { useScrollLock } from '../utils/scrollLock.ts';

interface NavbarProps {
  cartCount: number;
  onOpenCart: () => void;
  onSelectCategory: (category: ProductCategory | 'all') => void;
  onOpenBulk: () => void;
  onScrollToShop: () => void;
  onScrollToAbout: () => void;
  onScrollToContact?: () => void;
  categories?: Category[];
  onNavigate?: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  cartCount,
  onOpenCart,
  onSelectCategory,
  onOpenBulk,
  onScrollToShop,
  onScrollToAbout,
  onScrollToContact,
  categories = [],
  onNavigate,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when mobile menu drawer is open
  useScrollLock(mobileMenuOpen);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Handle Escape key and outside click for drawer and search overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        isSearchOpen &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mobileMenuOpen, isSearchOpen]);

  // Debounced search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const data = await fetchProducts({ search: searchQuery.trim(), limit: 6 });
        setSearchResults(data.products || []);
      } catch (err) {
        console.error('Failed to search products:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleNavClick = (callback: () => void) => {
    setMobileMenuOpen(false);
    callback();
  };

  const handleProductResultClick = (product: Product) => {
    setIsSearchOpen(false);
    const catSlug = typeof product.category === 'object' && product.category?.slug
      ? product.category.slug
      : String(product.category || 'all');

    if (onNavigate) {
      onNavigate(`/category/${catSlug}`);
    } else {
      onSelectCategory(catSlug);
      onScrollToShop();
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-40 bg-axdoro-bg/95 backdrop-blur-md border-b border-axdoro-border transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Balanced 3-column grid for perfect center logo alignment across all devices */}
          <div className="grid grid-cols-3 items-center h-20">
            {/* Left: Hamburger Menu Button */}
            <div className="flex items-center justify-start">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="group inline-flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-lg text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation-menu"
              >
                <Menu className="w-6 h-6 transition-transform group-hover:scale-105" />
                <span className="hidden sm:inline text-xs font-semibold tracking-wider uppercase">
                  Menu
                </span>
              </button>
            </div>

            {/* Center: Brand Logo */}
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  onSelectCategory('all');
                  if (onNavigate && window.location.pathname !== '/') {
                    onNavigate('/');
                  }
                }}
                className="flex items-center justify-center group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded-lg py-1 px-2"
                aria-label="AXDORO Home"
              >
                <img
                  src="/logo-dark.png"
                  alt="AXDORO"
                  width={144}
                  height={36}
                  className="h-7 sm:h-8 md:h-9 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                />
              </button>
            </div>

            {/* Right: Search and Bag Controls */}
            <div className="flex items-center justify-end gap-1.5 sm:gap-3">
              {/* Search Button */}
              <button
                type="button"
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className={`inline-flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-lg text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                  isSearchOpen ? 'text-axdoro-accent bg-axdoro-surface-muted' : ''
                }`}
                aria-label="Search Collection"
                aria-expanded={isSearchOpen}
              >
                <Search className="w-5 h-5" />
                <span className="hidden lg:inline text-xs font-semibold tracking-wide">
                  Search
                </span>
              </button>

              {/* Shopping Bag Button with Cart Counter */}
              <button
                type="button"
                onClick={onOpenCart}
                className="inline-flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-lg text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                aria-label={`Shopping bag with ${cartCount} items`}
              >
                <div className="relative flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5" />
                  {cartCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-axdoro-accent text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm animate-in zoom-in-50">
                      {cartCount}
                    </span>
                  )}
                </div>
                <span className="hidden sm:inline text-xs font-semibold">
                  Bag
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Expandable Top Search Bar Overlay */}
        {isSearchOpen && (
          <div
            ref={searchContainerRef}
            className="border-t border-axdoro-border bg-axdoro-surface/98 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-4 shadow-elevated animate-in slide-in-from-top-2 duration-200"
          >
            <div className="max-w-3xl mx-auto space-y-3">
              <div className="relative flex items-center">
                <Search className="absolute left-3.5 w-4 h-4 text-axdoro-text-muted pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search collections, shirts, pants, t-shirts, fabrics..."
                  className="w-full pl-10 pr-20 py-2.5 rounded-lg border border-axdoro-border bg-axdoro-bg text-axdoro-text text-sm placeholder:text-axdoro-text-muted focus:outline-none focus:border-axdoro-accent focus:ring-1 focus:ring-axdoro-accent transition-all"
                  aria-label="Search collection input"
                />
                <div className="absolute right-2 flex items-center gap-1">
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="p-1 text-axdoro-text-muted hover:text-axdoro-accent rounded transition-colors"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsSearchOpen(false)}
                    className="text-xs font-semibold px-2 py-1 text-axdoro-text-muted hover:text-axdoro-accent rounded transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Quick Category Chips */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="text-axdoro-text-muted">Quick filters:</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(false);
                    onSelectCategory('all');
                    onScrollToShop();
                  }}
                  className="px-2.5 py-1 rounded-full bg-axdoro-surface-muted hover:text-axdoro-accent hover:border-axdoro-accent/40 border border-transparent transition-colors"
                >
                  All Collection
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(false);
                    if (onNavigate) onNavigate('/category/pants');
                    else { onSelectCategory('pants'); onScrollToShop(); }
                  }}
                  className="px-2.5 py-1 rounded-full bg-axdoro-surface-muted hover:text-axdoro-accent hover:border-axdoro-accent/40 border border-transparent transition-colors"
                >
                  Pants & Trousers
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(false);
                    if (onNavigate) onNavigate('/category/shirts');
                    else { onSelectCategory('shirts'); onScrollToShop(); }
                  }}
                  className="px-2.5 py-1 rounded-full bg-axdoro-surface-muted hover:text-axdoro-accent hover:border-axdoro-accent/40 border border-transparent transition-colors"
                >
                  Shirts
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(false);
                    if (onNavigate) onNavigate('/category/t-shirts');
                    else { onSelectCategory('t-shirts'); onScrollToShop(); }
                  }}
                  className="px-2.5 py-1 rounded-full bg-axdoro-surface-muted hover:text-axdoro-accent hover:border-axdoro-accent/40 border border-transparent transition-colors"
                >
                  T-Shirts
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(false);
                    onOpenBulk();
                  }}
                  className="px-2.5 py-1 rounded-full bg-axdoro-accent/10 text-axdoro-accent hover:bg-axdoro-accent/20 border border-axdoro-accent/30 font-medium transition-colors"
                >
                  Bulk Orders
                </button>
              </div>

              {/* Live Search Results */}
              {isSearching ? (
                <div className="flex items-center justify-center py-6 text-axdoro-text-muted gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-axdoro-accent" />
                  <span>Searching products...</span>
                </div>
              ) : searchQuery && searchResults.length > 0 ? (
                <div className="divide-y divide-axdoro-border/60 max-h-72 overflow-y-auto rounded-lg border border-axdoro-border bg-axdoro-bg">
                  {searchResults.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleProductResultClick(product)}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-axdoro-surface-muted transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        {product.images?.[0] ? (
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="w-10 h-10 object-cover rounded border border-axdoro-border/60"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-axdoro-surface-muted rounded border border-axdoro-border/60 flex items-center justify-center text-[10px] text-axdoro-text-muted">
                            IMG
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-axdoro-text group-hover:text-axdoro-accent transition-colors">
                            {product.name}
                          </p>
                          <p className="text-xs text-axdoro-text-muted">
                            {typeof product.category === 'object' && product.category?.name
                              ? product.category.name
                              : String(product.categoryLabel || product.category || '')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-axdoro-text">
                          ₹{product.price || Math.round(product.pricePaise / 100)}
                        </span>
                        <ChevronRight className="w-4 h-4 text-axdoro-text-muted group-hover:text-axdoro-accent group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : searchQuery && !isSearching ? (
                <div className="py-6 text-center text-sm text-axdoro-text-muted">
                  No products matched &ldquo;{searchQuery}&rdquo;. Try another search term or browse our categories.
                </div>
              ) : null}
            </div>
          </div>
        )}
      </nav>

      {/* Slide-out Left Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in-0 duration-300"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Menu Panel */}
          <div
            id="mobile-navigation-menu"
            role="menu"
            aria-label="Navigation Menu"
            className="relative w-full max-w-sm sm:max-w-md bg-axdoro-surface border-r border-axdoro-border shadow-elevated z-10 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-left duration-300"
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-axdoro-border flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  onSelectCategory('all');
                  if (onNavigate && window.location.pathname !== '/') {
                    onNavigate('/');
                  }
                }}
                className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded"
                aria-label="AXDORO Home"
              >
                <img
                  src="/logo-dark.png"
                  alt="AXDORO"
                  width={144}
                  height={36}
                  className="h-7 w-auto object-contain"
                />
              </button>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                aria-label="Close navigation menu"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Drawer Navigation Links */}
            <div className="px-6 py-6 flex-1 space-y-6">
              <div className="space-y-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    handleNavClick(() => {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      onSelectCategory('all');
                      if (onNavigate && window.location.pathname !== '/') {
                        onNavigate('/');
                      }
                    })
                  }
                  className="w-full text-left text-base font-medium text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-3 px-3 rounded-lg flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
                >
                  <span>Home</span>
                  <ChevronRight className="w-4 h-4 text-axdoro-text-muted" />
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    handleNavClick(() => {
                      if (onNavigate && window.location.pathname !== '/') {
                        onNavigate('/');
                        setTimeout(() => onScrollToShop(), 50);
                      } else {
                        onSelectCategory('all');
                        onScrollToShop();
                      }
                    })
                  }
                  className="w-full text-left text-base font-medium text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-3 px-3 rounded-lg flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
                >
                  <span>All Collection</span>
                  <ChevronRight className="w-4 h-4 text-axdoro-text-muted" />
                </button>
              </div>

              {/* Categories Section */}
              <div className="space-y-2">
                <p className="px-3 text-[11px] font-bold tracking-wider text-axdoro-text-muted uppercase">
                  Categories
                </p>
                <div className="space-y-1">
                  {categories.length > 0 ? (
                    categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        role="menuitem"
                        onClick={() =>
                          handleNavClick(() => {
                            if (onNavigate) {
                              onNavigate(`/category/${cat.slug}`);
                            } else {
                              onSelectCategory(cat.slug);
                              onScrollToShop();
                            }
                          })
                        }
                        className="w-full text-left text-sm font-medium text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-3 rounded-lg flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
                      >
                        <span>{cat.name}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-axdoro-text-muted" />
                      </button>
                    ))
                  ) : (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() =>
                          handleNavClick(() => {
                            if (onNavigate) onNavigate('/category/t-shirts');
                            else { onSelectCategory('t-shirts'); onScrollToShop(); }
                          })
                        }
                        className="w-full text-left text-sm font-medium text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-3 rounded-lg flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
                      >
                        <span>T-Shirts (140 GSM)</span>
                        <ChevronRight className="w-3.5 h-3.5 text-axdoro-text-muted" />
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() =>
                          handleNavClick(() => {
                            if (onNavigate) onNavigate('/category/shirts');
                            else { onSelectCategory('shirts'); onScrollToShop(); }
                          })
                        }
                        className="w-full text-left text-sm font-medium text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-3 rounded-lg flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
                      >
                        <span>Shirts Collection</span>
                        <ChevronRight className="w-3.5 h-3.5 text-axdoro-text-muted" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Bulk Clothing Feature Banner */}
              <div className="pt-2">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleNavClick(onOpenBulk)}
                  className="w-full text-left p-3.5 rounded-xl border border-axdoro-accent/30 bg-axdoro-accent/10 hover:bg-axdoro-accent/20 transition-all flex items-center justify-between group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-axdoro-accent/20 flex items-center justify-center text-axdoro-accent">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-axdoro-text group-hover:text-axdoro-accent transition-colors">
                        Bulk Orders & B2B
                      </p>
                      <p className="text-xs text-axdoro-text-muted">
                        Custom screen printing & bespoke apparel
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-axdoro-accent group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* Secondary Navigation */}
              <div className="space-y-1 pt-2 border-t border-axdoro-border">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleNavClick(onScrollToAbout)}
                  className="w-full text-left text-sm font-medium text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-3 rounded-lg flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
                >
                  <span>About AXDORO</span>
                  <ChevronRight className="w-3.5 h-3.5 text-axdoro-text-muted" />
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleNavClick(() => onScrollToContact?.())}
                  className="w-full text-left text-sm font-medium text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-3 rounded-lg flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer"
                >
                  <span>Contact Us</span>
                  <ChevronRight className="w-3.5 h-3.5 text-axdoro-text-muted" />
                </button>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-6 border-t border-axdoro-border bg-axdoro-surface-muted/50 text-xs text-axdoro-text-muted space-y-1">
              <p className="font-semibold text-axdoro-text">AXDORO Clothing Co.</p>
              <p>Premium Heavyweight Essentials & Custom Manufacturing</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
