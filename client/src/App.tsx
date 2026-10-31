import React, { useState, useEffect } from 'react';
import { Product, Category, CartItem, ProductVariant, HeroSlide } from './types/product.ts';
import {
  fetchProductBySlug,
  fetchCategories,
  fetchHomepageHero,
  fetchHomepageCategorySections,
  PublicCategorySection,
} from './api/catalogue.ts';
import { Navbar } from './components/Navbar.tsx';
import { Hero } from './components/Hero.tsx';
import { CategoryPage } from './components/CategoryPage.tsx';
import { CategorySectionBlock } from './components/CategorySectionBlock.tsx';
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
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeProductDetail, setActiveProductDetail] = useState<Product | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [prefilledBulkProduct, setPrefilledBulkProduct] = useState<Product | null>(null);
  const [catalogueVersion, setCatalogueVersion] = useState(0);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null | undefined>(undefined);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[] | undefined>(undefined);
  const [categorySections, setCategorySections] = useState<PublicCategorySection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState<boolean>(true);
  const [sectionsError, setSectionsError] = useState<string | null>(null);

  // Sync route path on browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch active categories, hero, and homepage category sections on mount and when catalogue mutates
  useEffect(() => {
    let isCurrent = true;
    setSectionsLoading(true);

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
          setHeroSlides(res.slides);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setHeroImageUrl(null);
          setHeroSlides([]);
        }
      });

    fetchHomepageCategorySections()
      .then((sections) => {
        if (isCurrent) {
          setCategorySections(sections);
          setSectionsLoading(false);
          setSectionsError(null);
        }
      })
      .catch((err) => {
        if (isCurrent) {
          setCategorySections([]);
          setSectionsLoading(false);
          setSectionsError(err instanceof Error ? err.message : 'Failed to load category sections');
        }
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

  const handleSetQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return { ...item, quantity: newQuantity };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const handleScrollToShop = () => {
    const el =
      document.getElementById('pants-section') ||
      document.getElementById('shirts-section') ||
      document.getElementById('category-showcase') ||
      document.getElementById('collection-best-sellers');
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

  const handleScrollToContact = () => {
    const el = document.getElementById('contact-section');
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
          if (cat === 'all') {
            if (isCategoryRoute) {
              navigate('/');
              setTimeout(() => handleScrollToShop(), 50);
            } else {
              handleScrollToShop();
            }
          } else {
            navigate(`/category/${cat}`);
          }
        }}
        onOpenBulk={handleOpenGeneralBulk}
        onScrollToShop={handleScrollToShop}
        onScrollToAbout={handleScrollToAbout}
        onScrollToContact={handleScrollToContact}
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
            {/* 3. Hero Campaign Section (30% Top Category Strip + 70% Main Hero) */}
            <Hero
              onExplore={() => {
                const firstSectionSlug = categorySections[0]?.category?.slug;
                const el =
                  (firstSectionSlug && document.getElementById(`${firstSectionSlug}-section`)) ||
                  document.getElementById('pants-section') ||
                  document.getElementById('category-showcase');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              onOpenBulk={handleOpenGeneralBulk}
              heroImageUrl={heroImageUrl}
              slides={heroSlides}
              categories={categories}
              onNavigate={navigate}
            />

            {/* Dynamic Homepage Category Sections */}
            {sectionsLoading ? (
              <div className="py-12 max-w-7xl mx-auto px-4" data-testid="category-sections-loading">
                <div className="animate-pulse space-y-6">
                  <div className="h-7 bg-neutral-200 rounded w-1/4 mx-auto" />
                  <div className="h-4 bg-neutral-200 rounded w-1/3 mx-auto" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="bg-neutral-200 rounded-lg aspect-[3/4]" />
                    ))}
                  </div>
                </div>
              </div>
            ) : sectionsError ? (
              // Handled gracefully: Never silently fall back to hardcoded sections that resurrect disabled/deleted sections!
              null
            ) : categorySections.length > 0 ? (
              categorySections.map((section) => (
                <CategorySectionBlock
                  key={section.id}
                  id={`${section.category.slug}-section`}
                  categorySlug={section.category.slug}
                  title={section.heading}
                  subtitle={section.subtitle || undefined}
                  shortcuts={section.categoryCards}
                  bannerImage={section.posterImageUrl || undefined}
                  bannerTitle={section.posterHeading || undefined}
                  bannerSubtitle={section.posterSubtitle || undefined}
                  bannerDestinationUrl={section.posterDestinationUrl || undefined}
                  productLimit={section.productLimit}
                  viewAllLabel={section.viewAllLabel}
                  viewAllLink={section.viewAllDestination || `/category/${section.category.slug}`}
                  onQuickView={handleQuickView}
                  onAddToCart={handleAddToCart}
                  onNavigate={navigate}
                />
              ))
            ) : null}

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
          if (cat === 'all') {
            if (isCategoryRoute) {
              navigate('/');
              setTimeout(() => handleScrollToShop(), 50);
            } else {
              handleScrollToShop();
            }
          } else {
            navigate(`/category/${cat}`);
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
        onSetQuantity={handleSetQuantity}
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
