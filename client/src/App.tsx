import React, { useState, useEffect } from 'react';
import { Product, ProductCategory, Category, CartItem, ProductVariant } from './types/product.ts';
import { fetchProductBySlug, fetchCategories, fetchHomepageHero } from './api/catalogue.ts';
import { Navbar } from './components/Navbar.tsx';
import { Hero } from './components/Hero.tsx';
import { CategoryShowcase } from './components/CategoryShowcase.tsx';
import { HomepageCollectionSection } from './components/HomepageCollections.tsx';
import { CategoryPage } from './components/CategoryPage.tsx';
import { EditorialSection } from './components/EditorialSection.tsx';
import { Newsletter } from './components/Newsletter.tsx';
import { Footer } from './components/Footer.tsx';
import { ProductDetailModal } from './components/ProductDetailModal.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { BulkEnquiryModal } from './components/BulkEnquiryModal.tsx';
import { CheckoutModal } from './components/CheckoutModal.tsx';
import { AdminPortal } from './components/admin/AdminPortal.tsx';
export default function App(): React.JSX.Element {
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeProductDetail, setActiveProductDetail] = useState<Product | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [prefilledBulkProduct, setPrefilledBulkProduct] = useState<Product | null>(null);
  const [catalogueVersion, setCatalogueVersion] = useState(0);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);

  // Sync route path on browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch active categories and homepage hero on mount and when catalogue mutates
  useEffect(() => {
    let isCurrent = true;
    fetchCategories()
      .then((data) => {
        if (isCurrent) {
          setCategories(data);
        }
      })
      .catch(() => {
        // Handled gracefully with fallback
      });

    fetchHomepageHero()
      .then((res) => {
        if (isCurrent) {
          setHeroImageUrl(res.imageUrl || null);
        }
      })
      .catch(() => {
        // Handled gracefully with default
      });

    return () => {
      isCurrent = false;
    };
  }, [catalogueVersion]);

  const navigate = (path: string) => {
    window.history.pushState(null, '', path);
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    const el = document.getElementById('category-showcase') || document.getElementById('collection-best-sellers');
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

  const isCategoryRoute = currentPath.startsWith('/category/');
  const categorySlug = isCategoryRoute
    ? decodeURIComponent(currentPath.replace(/^\/category\//, '').replace(/\/.*$/, ''))
    : '';

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="storefront-root min-h-screen bg-axdoro-bg text-axdoro-text flex flex-col justify-between selection:bg-axdoro-accent selection:text-white">
      {/* Responsive Sticky Navbar */}
      <Navbar
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        onSelectCategory={(cat) => {
          setSelectedCategory(cat);
          if (isCategoryRoute) {
            navigate('/');
            setTimeout(() => handleScrollToShop(), 50);
          }
        }}
        onOpenBulk={handleOpenGeneralBulk}
        onScrollToShop={handleScrollToShop}
        onScrollToAbout={handleScrollToAbout}
        categories={categories}
        onNavigate={navigate}
      />

      {/* Main Content Area: Dedicated Category Page or Storefront Homepage */}
      <main className="flex-1">
        {isCategoryRoute && categorySlug ? (
          <CategoryPage
            slug={categorySlug}
            onNavigate={navigate}
            onQuickView={handleQuickView}
            onAddToCart={handleAddToCart}
            onOpenBulk={handleOpenGeneralBulk}
          />
        ) : (
          <>
            {/* 3. Hero Campaign Section */}
            <Hero
              onExplore={handleScrollToShop}
              onOpenBulk={handleOpenGeneralBulk}
              heroImageUrl={heroImageUrl}
            />

            {/* 4. Category Showcase Cards */}
            <CategoryShowcase
              activeCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              onScrollToShop={handleScrollToShop}
              categories={categories}
              onNavigate={navigate}
            />

            {/* 4.5. This Month's Best Sellers (Admin-Curated Section) */}
            <HomepageCollectionSection
              key={`best-sellers-${catalogueVersion}`}
              slug="best-sellers"
              badgeText="Top Sellers"
              onQuickView={handleQuickView}
              onAddToCart={handleAddToCart}
              onNavigateCategory={(cat) => {
                setSelectedCategory(cat);
                handleScrollToShop();
              }}
            />

            {/* 4.6. Signature Picks (Admin-Curated Section) */}
            <HomepageCollectionSection
              key={`signature-picks-${catalogueVersion}`}
              slug="signature-picks"
              badgeText="Curated Selection"
              variant="alternate"
              onQuickView={handleQuickView}
              onAddToCart={handleAddToCart}
              onNavigateCategory={(cat) => {
                setSelectedCategory(cat);
                handleScrollToShop();
              }}
            />

            {/* 5. Editorial Brand Story & Pillars */}
            <EditorialSection onOpenBulk={handleOpenGeneralBulk} />

            {/* 7. Newsletter Signup (Demo UI) */}
            <Newsletter />
          </>
        )}
      </main>

      {/* 8. Footer */}
      <Footer
        onSelectCategory={(cat) => {
          setSelectedCategory(cat);
          if (isCategoryRoute) {
            navigate('/');
            setTimeout(() => handleScrollToShop(), 50);
          }
        }}
        onOpenBulk={handleOpenGeneralBulk}
        onScrollToShop={handleScrollToShop}
        onScrollToAbout={handleScrollToAbout}
        categories={categories}
        onNavigate={navigate}
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
