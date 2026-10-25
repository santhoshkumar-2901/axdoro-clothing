import React, { useState, useEffect, useRef } from 'react';
import { ShoppingBag, Menu, X, Layers, ChevronDown } from 'lucide-react';
import { ProductCategory, Category } from '../types/product.ts';

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
  const [shopDropdownOpen, setShopDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShopDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
      if (e.key === 'Escape' && shopDropdownOpen) {
        setShopDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shopDropdownOpen, mobileMenuOpen]);

  return (
    <nav className="sticky top-0 z-40 bg-axdoro-bg backdrop-blur-md border-b border-axdoro-border transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand Logo (Far Left) */}
          <div className="flex-shrink-0">
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                onSelectCategory('all');
                if (onNavigate && window.location.pathname !== '/') {
                  onNavigate('/');
                }
              }}
              className="flex items-center gap-3 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded-lg py-1 px-1"
              aria-label="AXDORO Home"
            >
              <img
                src="/logo-transparent.png"
                alt="AXDORO"
                width={144}
                height={36}
                className="h-8 sm:h-9 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
              />
            </button>
          </div>

          {/* Desktop Right-Aligned Navigation & Bag Action */}
          <div className="hidden md:flex items-center gap-6 lg:gap-8">
            {/* Desktop Navigation Links */}
            <div className="flex items-center gap-4 lg:gap-7 text-xs sm:text-sm font-medium">
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  onSelectCategory('all');
                  if (onNavigate && window.location.pathname !== '/') {
                    onNavigate('/');
                  }
                }}
                className="text-axdoro-text hover:text-axdoro-accent transition-colors cursor-pointer py-1 px-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                Home
              </button>

              <button
                onClick={onScrollToAbout}
                className="text-axdoro-text hover:text-axdoro-accent transition-colors cursor-pointer py-1 px-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                About
              </button>

              {/* Shop / Categories Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShopDropdownOpen(!shopDropdownOpen)}
                  onMouseEnter={() => setShopDropdownOpen(true)}
                  aria-expanded={shopDropdownOpen}
                  aria-haspopup="true"
                  className="inline-flex items-center gap-1.5 text-axdoro-text hover:text-axdoro-accent transition-colors cursor-pointer py-1 px-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                >
                  <span>Shop</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      shopDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {shopDropdownOpen && (
                  <div
                    role="menu"
                    onMouseLeave={() => setShopDropdownOpen(false)}
                    className="absolute left-0 mt-2 w-48 rounded-xl bg-axdoro-surface border border-axdoro-border/80 shadow-elevated p-2 space-y-1 animate-in fade-in-50 zoom-in-95 duration-150 z-50"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setShopDropdownOpen(false);
                        if (onNavigate && window.location.pathname !== '/') {
                          onNavigate('/');
                          setTimeout(() => onScrollToShop(), 50);
                        } else {
                          onSelectCategory('all');
                          onScrollToShop();
                        }
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                    >
                      All Collection
                    </button>

                    {categories.length > 0 ? (
                      categories.map((cat) => (
                        <button
                          key={cat.id}
                          role="menuitem"
                          onClick={() => {
                            setShopDropdownOpen(false);
                            if (onNavigate) {
                              onNavigate(`/category/${cat.slug}`);
                            } else {
                              onSelectCategory(cat.slug);
                              onScrollToShop();
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-medium rounded-lg text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                        >
                          {cat.name}
                        </button>
                      ))
                    ) : (
                      <>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShopDropdownOpen(false);
                            if (onNavigate) onNavigate('/category/t-shirts');
                            else {
                              onSelectCategory('t-shirts');
                              onScrollToShop();
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-medium rounded-lg text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                        >
                          T-Shirts (140 GSM)
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShopDropdownOpen(false);
                            if (onNavigate) onNavigate('/category/shirts');
                            else {
                              onSelectCategory('shirts');
                              onScrollToShop();
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-medium rounded-lg text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                        >
                          Shirts Collection
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={onOpenBulk}
                className="flex items-center gap-1.5 text-axdoro-accent-muted hover:text-axdoro-accent transition-colors cursor-pointer py-1 px-1.5 rounded font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                <Layers className="w-4 h-4" />
                <span>Bulk Orders</span>
              </button>

              <button
                onClick={onScrollToContact}
                className="text-axdoro-text hover:text-axdoro-accent transition-colors cursor-pointer py-1 px-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                Contact Us
              </button>
            </div>

            {/* Shopping Bag Trigger with "Add to Bag" Label */}
            <button
              onClick={onOpenCart}
              className="inline-flex items-center gap-2 py-2 px-3.5 rounded-lg border border-axdoro-border/80 bg-axdoro-surface hover:border-axdoro-accent hover:text-axdoro-accent text-axdoro-text transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent text-xs font-semibold shadow-subtle"
              aria-label={`Shopping bag with ${cartCount} items`}
            >
              <div className="relative flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-axdoro-accent text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm animate-in zoom-in-50">
                    {cartCount}
                  </span>
                )}
              </div>
              <span>Add to Bag</span>
            </button>
          </div>

          {/* Mobile Right Action Controls (Bag, Hamburger) */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={onOpenCart}
              className="relative p-2 rounded-lg hover:bg-white/5 text-axdoro-text hover:text-axdoro-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              aria-label={`Shopping bag with ${cartCount} items`}
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute top-0.5 right-0.5 bg-axdoro-accent text-black text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm animate-in zoom-in-50">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-white/5 text-axdoro-text hover:text-axdoro-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation-menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div
          id="mobile-navigation-menu"
          className="md:hidden border-t border-axdoro-border bg-axdoro-surface px-6 py-6 space-y-4 shadow-elevated animate-in slide-in-from-top-2 duration-200"
        >
          <div className="flex flex-col gap-1 font-medium text-sm">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                onSelectCategory('all');
              }}
              className="text-left text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-2 rounded min-h-[44px] flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              Home
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                if (onNavigate && window.location.pathname !== '/') {
                  onNavigate('/');
                  setTimeout(() => onScrollToShop(), 50);
                } else {
                  onSelectCategory('all');
                  onScrollToShop();
                }
              }}
              className="text-left text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-2 rounded min-h-[44px] flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              All Collection
            </button>
            {categories.length > 0 ? (
              categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (onNavigate) {
                      onNavigate(`/category/${cat.slug}`);
                    } else {
                      onSelectCategory(cat.slug);
                      onScrollToShop();
                    }
                  }}
                  className="text-left text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-2 rounded min-h-[44px] flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                >
                  {cat.name}
                </button>
              ))
            ) : (
              <>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (onNavigate) onNavigate('/category/t-shirts');
                    else { onSelectCategory('t-shirts'); onScrollToShop(); }
                  }}
                  className="text-left text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-2 rounded min-h-[44px] flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                >
                  T-Shirts (140 GSM)
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (onNavigate) onNavigate('/category/shirts');
                    else { onSelectCategory('shirts'); onScrollToShop(); }
                  }}
                  className="text-left text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-2 rounded min-h-[44px] flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                >
                  Shirts Collection
                </button>
              </>
            )}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenBulk();
              }}
              className="text-left text-axdoro-accent-muted hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-2 rounded min-h-[44px] flex items-center gap-2 font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              <Layers className="w-4 h-4" />
              <span>Bulk Clothing Orders</span>
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onScrollToContact?.();
              }}
              className="text-left text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-2 rounded min-h-[44px] flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              Contact Us
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onScrollToAbout();
              }}
              className="text-left text-axdoro-text hover:text-axdoro-accent hover:bg-axdoro-surface-muted py-2.5 px-2 rounded min-h-[44px] flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              About AXDORO
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};
