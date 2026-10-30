import React, { useState, useEffect } from 'react';
import { Product, Category, CartItem, ProductVariant, HeroSlide, CategoryShortcutItem } from './types/product.ts';
import { fetchProductBySlug, fetchCategories, fetchHomepageHero } from './api/catalogue.ts';
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

const PANTS_SHORTCUTS: CategoryShortcutItem[] = [
  {
    id: 'pants-bootcut',
    label: 'Bootcut',
    sublabel: 'Pants',
    imageUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600&auto=format&fit=crop&q=80',
    query: 'Bootcut',
  },
  {
    id: 'pants-korean',
    label: 'Korean',
    sublabel: 'Trousers',
    imageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&auto=format&fit=crop&q=80',
    query: 'Korean',
  },
  {
    id: 'pants-gurkha',
    label: 'Gurkha',
    sublabel: 'Pants',
    imageUrl: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600&auto=format&fit=crop&q=80',
    query: 'Gurkha',
  },
  {
    id: 'pants-pleated',
    label: 'Pleated',
    sublabel: 'Pants',
    imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80',
    query: 'Pleated',
  },
  {
    id: 'pants-baggy-jeans',
    label: 'Baggy',
    sublabel: 'Jeans',
    imageUrl: 'https://images.unsplash.com/photo-1604176354204-9268737828e4?w=600&auto=format&fit=crop&q=80',
    query: 'Baggy',
  },
  {
    id: 'pants-relaxed-loose',
    label: 'Relaxed',
    sublabel: 'Loose Fit',
    imageUrl: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=600&auto=format&fit=crop&q=80',
    query: 'Relaxed',
  },
  {
    id: 'pants-wide-leg',
    label: 'Wide Leg',
    sublabel: 'Trousers',
    imageUrl: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&auto=format&fit=crop&q=80',
    query: 'Wide Leg',
  },
  {
    id: 'pants-straight-fit',
    label: 'Straight Fit',
    sublabel: 'Pants',
    imageUrl: 'https://images.unsplash.com/photo-1479064555552-3ef4979f8908?w=600&auto=format&fit=crop&q=80',
    query: 'Straight Fit',
  },
];

const SHIRTS_SHORTCUTS: CategoryShortcutItem[] = [
  {
    id: 'shirts-oxford',
    label: 'Oxford',
    sublabel: 'Button-Down',
    imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&auto=format&fit=crop&q=80',
    query: 'Oxford',
  },
  {
    id: 'shirts-cuban',
    label: 'Cuban Collar',
    sublabel: 'Resort Shirt',
    imageUrl: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
    query: 'Cuban',
  },
  {
    id: 'shirts-linen',
    label: 'Linen Blend',
    sublabel: 'Overshirt',
    imageUrl: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=600&auto=format&fit=crop&q=80',
    query: 'Linen',
  },
  {
    id: 'shirts-overshirt',
    label: 'Overshirt',
    sublabel: 'Contemporary',
    imageUrl: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?w=600&auto=format&fit=crop&q=80',
    query: 'Overshirt',
  },
];

const TSHIRTS_SHORTCUTS: CategoryShortcutItem[] = [
  {
    id: 'tshirts-140gsm',
    label: '140 GSM',
    sublabel: 'Combed Cotton',
    imageUrl: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=600&auto=format&fit=crop&q=80',
    query: '140 GSM',
  },
  {
    id: 'tshirts-crewneck',
    label: 'Crewneck',
    sublabel: 'Classic Tee',
    imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80',
    query: 'Crewneck',
  },
  {
    id: 'tshirts-pocket',
    label: 'Pocket Tee',
    sublabel: 'Minimalist',
    imageUrl: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=600&auto=format&fit=crop&q=80',
    query: 'Pocket',
  },
  {
    id: 'tshirts-heavyweight',
    label: 'Heavyweight',
    sublabel: 'Relaxed Tee',
    imageUrl: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600&auto=format&fit=crop&q=80',
    query: 'Heavyweight',
  },
];
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
          setHeroSlides(res.slides);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setHeroImageUrl(null);
          setHeroSlides([]);
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
                const el = document.getElementById('pants-section') || document.getElementById('category-showcase');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              onOpenBulk={handleOpenGeneralBulk}
              heroImageUrl={heroImageUrl}
              slides={heroSlides}
              categories={categories}
              onNavigate={navigate}
            />

            {/* 4. Pants Section with Shortcuts & 4-Product Carousel */}
            <CategorySectionBlock
              id="pants-section"
              categorySlug="pants"
              title="Pants & Trousers"
              subtitle="Relaxed, pleated, and contemporary cuts engineered for all-day comfort"
              shortcuts={PANTS_SHORTCUTS}
              bannerImage="https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1600&auto=format&fit=crop&q=80"
              bannerTitle="Loose Fit Pleated Pants"
              bannerSubtitle="Architectural drape cut from tailored cotton-blend foundations"
              viewAllLink="/category/pants"
              onQuickView={handleQuickView}
              onAddToCart={handleAddToCart}
              onNavigate={navigate}
            />

            {/* 5. Shirts Section ("TOPWEAR") */}
            <CategorySectionBlock
              id="shirts-section"
              categorySlug="shirts"
              title="Topwear & Shirts"
              subtitle="Pinpoint Oxford, Cuban camp collar, and breathable linen silhouettes"
              shortcuts={SHIRTS_SHORTCUTS}
              bannerImage="https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=1600&auto=format&fit=crop&q=80"
              bannerTitle="Curated Topwear"
              bannerSubtitle="Tailored button-downs and resort collars"
              viewAllLink="/category/shirts"
              onQuickView={handleQuickView}
              onAddToCart={handleAddToCart}
              onNavigate={navigate}
            />

            {/* 6. T-Shirts Section */}
            <CategorySectionBlock
              id="tshirts-section"
              categorySlug="t-shirts"
              title="T-Shirts & Essentials"
              subtitle="Combed breathable cotton tees cut in tailored regular and relaxed profiles"
              shortcuts={TSHIRTS_SHORTCUTS}
              bannerImage="https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1600&auto=format&fit=crop&q=80"
              bannerTitle="140 GSM Combed Cotton Essentials"
              bannerSubtitle="Breathable everyday foundations engineered for all-day comfort and bespoke branding"
              viewAllLink="/category/t-shirts"
              onQuickView={handleQuickView}
              onAddToCart={handleAddToCart}
              onNavigate={navigate}
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
