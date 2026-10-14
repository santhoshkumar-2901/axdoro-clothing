import React, { useState, useEffect } from 'react';
import { Product, ProductCategory, CartItem, ProductVariant } from './types/product.ts';
import { fetchProductBySlug } from './api/catalogue.ts';
import { PromoBanner } from './components/PromoBanner.tsx';
import { Navbar } from './components/Navbar.tsx';
import { Hero } from './components/Hero.tsx';
import { CategoryShowcase } from './components/CategoryShowcase.tsx';
import { ProductCatalogue } from './components/ProductCatalogue.tsx';
import { EditorialSection } from './components/EditorialSection.tsx';
import { Newsletter } from './components/Newsletter.tsx';
import { Footer } from './components/Footer.tsx';
import { ProductDetailModal } from './components/ProductDetailModal.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { BulkEnquiryModal } from './components/BulkEnquiryModal.tsx';
import { CheckoutModal } from './components/CheckoutModal.tsx';
import { AdminPortal } from './components/admin/AdminPortal.tsx';
import { ThemeId, getStoredTheme, setStoredTheme, applyThemeToDocument } from './lib/theme.ts';

export default function App(): React.JSX.Element {
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [theme, setTheme] = useState<ThemeId>(() => getStoredTheme());
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeProductDetail, setActiveProductDetail] = useState<Product | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [prefilledBulkProduct, setPrefilledBulkProduct] = useState<Product | null>(null);
  const [catalogueVersion, setCatalogueVersion] = useState(0);

  const handleThemeChange = (nextTheme: ThemeId) => {
    setTheme(nextTheme);
    setStoredTheme(nextTheme);
    applyThemeToDocument(nextTheme, currentPath);
  };

  // Sync document data-theme on route changes and theme updates
  useEffect(() => {
    applyThemeToDocument(theme, currentPath);
  }, [currentPath, theme]);

  // Sync route path on browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState(null, '', path);
    setCurrentPath(path);
  };

  // Cart operations with exact integer paise pricing
  const handleAddToCart = (
    product: Product,
    size: string,
    color: string,
    quantity: number = 1,
    variant?: ProductVariant
  ) => {
    const instanceId = variant ? `${product.id}-${variant.id}` : `${product.id}-${size}-${color}`;
    const pricePaise = variant ? variant.pricePaise : (product.pricePaise || product.price * 100);
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === instanceId);
      if (existing) {
        return prev.map((item) =>
          item.id === instanceId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [
        ...prev,
        {
          id: instanceId,
          product,
          variantId: variant?.id,
          selectedSize: size,
          selectedColor: color,
          pricePaise,
          quantity,
        },
      ];
    });
  };

  const handleQuickView = async (product: Product) => {
    try {
      const detail = await fetchProductBySlug(product.slug);
      setActiveProductDetail(detail);
    } catch {
      setActiveProductDetail(product);
    }
  };

  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === itemId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const handleScrollToShop = () => {
    const el = document.getElementById('shop-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleScrollToAbout = () => {
    const el = document.getElementById('about-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOpenBulkWithProduct = (product: Product) => {
    setPrefilledBulkProduct(product);
    setIsBulkModalOpen(true);
  };

  const handleOpenGeneralBulk = () => {
    setPrefilledBulkProduct(null);
    setIsBulkModalOpen(true);
  };

  // Dedicated Route Isolation: /admin is the standalone entry point
  if (currentPath.startsWith('/admin')) {
    return (
      <AdminPortal
        onNavigateHome={() => navigate('/')}
        onCatalogueMutated={() => setCatalogueVersion((v) => v + 1)}
      />
    );
  }

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div
      data-theme={theme}
      className="storefront-root min-h-screen bg-axdoro-bg text-axdoro-text flex flex-col justify-between selection:bg-axdoro-accent selection:text-white"
    >
      {/* 1. Promotional Header Banner */}
      <PromoBanner onOpenBulk={handleOpenGeneralBulk} />

      {/* 2. Responsive Sticky Navbar */}
      <Navbar
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        onSelectCategory={setSelectedCategory}
        onOpenBulk={handleOpenGeneralBulk}
        onScrollToShop={handleScrollToShop}
        onScrollToAbout={handleScrollToAbout}
        currentTheme={theme}
        onSelectTheme={handleThemeChange}
      />

      {/* 3. Hero Campaign Section */}
      <main className="flex-1">
        <Hero
          onExplore={handleScrollToShop}
          onOpenBulk={handleOpenGeneralBulk}
        />

        {/* 4. Category Showcase Cards */}
        <CategoryShowcase
          activeCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onScrollToShop={handleScrollToShop}
        />

        {/* 5. Product Catalogue & Filters */}
        <ProductCatalogue
          key={catalogueVersion}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onQuickView={handleQuickView}
          onAddToCart={handleAddToCart}
        />

        {/* 6. Editorial Brand Story & Pillars */}
        <EditorialSection onOpenBulk={handleOpenGeneralBulk} />

        {/* 7. Newsletter Signup (Demo UI) */}
        <Newsletter />
      </main>

      {/* 8. Footer */}
      <Footer
        onSelectCategory={setSelectedCategory}
        onOpenBulk={handleOpenGeneralBulk}
        onScrollToShop={handleScrollToShop}
        onScrollToAbout={handleScrollToAbout}
        currentTheme={theme}
      />

      {/* Interactive Modals & Drawers */}
      <ProductDetailModal
        product={activeProductDetail}
        onClose={() => setActiveProductDetail(null)}
        onAddToCart={handleAddToCart}
        onOpenBulkWithProduct={handleOpenBulkWithProduct}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        onProceedToCheckout={() => setIsCheckoutOpen(true)}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartItems={cartItems}
        onOrderSuccess={handleClearCart}
      />

      <BulkEnquiryModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        prefilledProduct={prefilledBulkProduct}
      />
    </div>
  );
}
