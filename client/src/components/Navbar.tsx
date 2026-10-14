import React, { useState, useEffect } from 'react';
import { ShoppingBag, Search, Menu, X, Layers } from 'lucide-react';
import { ProductCategory } from '../types/product.ts';
import { ThemeId, getStoredTheme } from '../lib/theme.ts';
import { ThemePreviewSwitcher } from './ThemePreviewSwitcher.tsx';

interface NavbarProps {
  cartCount: number;
  onOpenCart: () => void;
  onSelectCategory: (category: ProductCategory | 'all') => void;
  onOpenBulk: () => void;
  onScrollToShop: () => void;
  onScrollToAbout: () => void;
  currentTheme?: ThemeId;
  onSelectTheme?: (theme: ThemeId) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  cartCount,
  onOpenCart,
  onSelectCategory,
  onOpenBulk,
  onScrollToShop,
  onScrollToAbout,
  currentTheme,
  onSelectTheme,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const effectiveTheme = currentTheme || getStoredTheme();
  const handleThemeChange = (t: ThemeId) => {
    if (onSelectTheme) {
      onSelectTheme(t);
    }
  };
  const isDarkTheme = effectiveTheme === 'deep-purple' || effectiveTheme === 'midnight-neon';

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <nav className="sticky top-0 z-40 bg-axdoro-bg backdrop-blur-md border-b border-axdoro-border transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand Logo & Desktop Navigation */}
          <div className="flex items-center gap-8">
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                onSelectCategory('all');
              }}
              className="flex items-center gap-3 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded-lg py-1 px-1"
              aria-label="AXDORO Home"
            >
              <img
                src={isDarkTheme ? '/logo-white.png' : '/logo-dark.png'}
                alt="AXDORO"
                width={144}
                height={36}
                className="h-8 sm:h-9 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
              />
            </button>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-medium">
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  onSelectCategory('all');
                }}
                className="text-axdoro-text hover:text-black transition-colors cursor-pointer py-1 px-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                Home
              </button>
              <button
                onClick={() => {
                  onSelectCategory('all');
                  onScrollToShop();
                }}
                className="text-axdoro-text hover:text-black transition-colors cursor-pointer py-1 px-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                Collection
              </button>
              <button
                onClick={() => {
                  onSelectCategory('t-shirts');
                  onScrollToShop();
                }}
                className="text-axdoro-text hover:text-black transition-colors cursor-pointer py-1 px-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                T-Shirts <span className="text-[10px] text-axdoro-accent-muted font-mono font-bold ml-0.5">140 GSM</span>
              </button>
              <button
                onClick={() => {
                  onSelectCategory('shirts');
                  onScrollToShop();
                }}
                className="text-axdoro-text hover:text-black transition-colors cursor-pointer py-1 px-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                Shirts
              </button>
              <button
                onClick={onOpenBulk}
                className="flex items-center gap-1.5 text-axdoro-accent-muted hover:text-axdoro-accent transition-colors cursor-pointer py-1 px-1.5 rounded font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                <Layers className="w-4 h-4" />
                <span>Bulk Orders</span>
              </button>
              <button
                onClick={onScrollToAbout}
                className="text-axdoro-text hover:text-black transition-colors cursor-pointer py-1 px-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                About
              </button>
            </div>
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Desktop Theme Preview Switcher */}
            <div className="hidden sm:block">
              <ThemePreviewSwitcher
                currentTheme={effectiveTheme}
                onSelectTheme={handleThemeChange}
                variant="desktop"
              />
            </div>

            <button
              onClick={onScrollToShop}
              className="p-2.5 rounded-lg hover:bg-black/5 text-axdoro-text hover:text-black transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              aria-label="Search Collection"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Shopping Bag Trigger */}
            <button
              onClick={onOpenCart}
              className="relative p-2.5 rounded-lg hover:bg-black/5 text-axdoro-text hover:text-black transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              aria-label={`Shopping bag with ${cartCount} items`}
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 bg-axdoro-charcoal text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm animate-in zoom-in-50">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2.5 rounded-lg hover:bg-black/5 text-axdoro-text hover:text-black transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
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
          {/* Mobile Theme Preview Control */}
          <div className="pb-3 border-b border-axdoro-border">
            <ThemePreviewSwitcher
              currentTheme={effectiveTheme}
              onSelectTheme={(t) => {
                handleThemeChange(t);
                setMobileMenuOpen(false);
              }}
              variant="mobile"
            />
          </div>
          <div className="flex flex-col gap-1 font-medium text-sm">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                onSelectCategory('all');
              }}
              className="text-left text-axdoro-text hover:text-black py-2.5 px-2 rounded min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              Home
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onSelectCategory('all');
                onScrollToShop();
              }}
              className="text-left text-axdoro-text hover:text-black py-2.5 px-2 rounded min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              All Collection
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onSelectCategory('t-shirts');
                onScrollToShop();
              }}
              className="text-left text-axdoro-text hover:text-black py-2.5 px-2 rounded min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              T-Shirts (140 GSM)
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onSelectCategory('shirts');
                onScrollToShop();
              }}
              className="text-left text-axdoro-text hover:text-black py-2.5 px-2 rounded min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              Shirts Collection
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenBulk();
              }}
              className="text-left text-axdoro-accent-muted hover:text-axdoro-accent py-2.5 px-2 rounded min-h-[44px] flex items-center gap-2 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              <Layers className="w-4 h-4" />
              <span>Bulk Clothing Orders</span>
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onScrollToAbout();
              }}
              className="text-left text-axdoro-text hover:text-black py-2.5 px-2 rounded min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
            >
              About AXDORO
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};
