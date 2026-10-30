import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { HeroSlide, Category } from '../types/product.ts';

export const DEFAULT_CATEGORY_IMAGES: Record<string, string> = {
  't-shirts': '/categories/t-shirts-3d.webp',
  'shirts': '/categories/shirts-3d.webp',
  'pants': '/categories/pants-3d.webp',
  'jeans': '/categories/jeans-3d.webp',
};

export const GENERIC_CATEGORY_IMAGE = '/categories/shirts-3d.webp';

export interface HeroProps {
  onExplore?: () => void;
  onOpenBulk?: () => void;
  heroImageUrl?: string | null;
  slides?: HeroSlide[];
  categories?: Category[];
  onNavigate?: (path: string) => void;
}

export const Hero: React.FC<HeroProps> = ({
  heroImageUrl,
  slides,
  categories,
  onNavigate,
  onExplore,
}) => {
  const isSettingsResolved = slides !== undefined || heroImageUrl !== undefined;
  const isCategoriesResolved = categories !== undefined;

  // ---------------------------------------------------------------------------
  // Top Category Carousel (Strictly 30% of combined opening container height)
  // Continuous horizontal sliding strip with 3D product renders (Shirts, Pants, T-Shirts, Jeans)
  // ---------------------------------------------------------------------------
  const fallbackDefaultCategories: Category[] = useMemo(
    () => [
      { id: '2', slug: 'shirts', name: 'Shirts', description: null, displayOrder: 1, imageUrl: DEFAULT_CATEGORY_IMAGES['shirts'] },
      { id: '3', slug: 'pants', name: 'Pants', description: null, displayOrder: 2, imageUrl: DEFAULT_CATEGORY_IMAGES['pants'] },
      { id: '1', slug: 't-shirts', name: 'T-Shirts', description: null, displayOrder: 3, imageUrl: DEFAULT_CATEGORY_IMAGES['t-shirts'] },
      { id: '4', slug: 'jeans', name: 'Jeans', description: null, displayOrder: 4, imageUrl: DEFAULT_CATEGORY_IMAGES['jeans'] },
    ],
    []
  );

  const usableCategories = useMemo(() => {
    if (!isCategoriesResolved) return [];
    if (categories && categories.length > 0) {
      const list = [...categories.filter((c) => c && c.slug)];
      // Ensure jeans is present in the 4-item strip
      if (!list.some((c) => c.slug === 'jeans')) {
        list.push({
          id: 'cat-jeans',
          slug: 'jeans',
          name: 'Jeans',
          description: null,
          displayOrder: 4,
          imageUrl: DEFAULT_CATEGORY_IMAGES['jeans'],
        });
      }
      // Visual order matching reference: Shirts, Pants, T-Shirts, Jeans
      const desiredOrder = ['shirts', 'pants', 't-shirts', 'jeans'];
      list.sort((a, b) => {
        const idxA = desiredOrder.indexOf(a.slug);
        const idxB = desiredOrder.indexOf(b.slug);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return (a.displayOrder || 0) - (b.displayOrder || 0);
      });
      return list;
    }
    return fallbackDefaultCategories;
  }, [categories, isCategoriesResolved, fallbackDefaultCategories]);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isTouching, setIsTouching] = useState(false);
  const [touchDeltaX, setTouchDeltaX] = useState(0);

  // Reduced motion media query listener
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
      }
      return () => {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', listener);
        }
      };
    }
  }, []);

  // Touch swiping and interaction handlers for continuous category strip
  const catTouchStartXRef = useRef<number | null>(null);
  const catTouchStartYRef = useRef<number | null>(null);

  const handleCatTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      catTouchStartXRef.current = e.touches[0].clientX;
      catTouchStartYRef.current = e.touches[0].clientY;
      setIsTouching(true);
    }
  };

  const handleCatTouchMove = (e: React.TouchEvent) => {
    if (catTouchStartXRef.current === null || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - catTouchStartXRef.current;
    const deltaY = e.touches[0].clientY - (catTouchStartYRef.current ?? e.touches[0].clientY);
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setTouchDeltaX(deltaX);
    }
  };

  const handleCatTouchEnd = () => {
    setIsTouching(false);
    setTouchDeltaX(0);
    catTouchStartXRef.current = null;
    catTouchStartYRef.current = null;
  };

  // Build repeated sequence to guarantee adequate track width across all screen resolutions
  const repeatCount = useMemo(() => {
    if (usableCategories.length === 0) return 1;
    return Math.max(3, Math.ceil(12 / usableCategories.length));
  }, [usableCategories.length]);

  const primarySequence = useMemo(() => {
    if (usableCategories.length === 0) return [];
    return Array.from({ length: repeatCount }, () => usableCategories).flat();
  }, [usableCategories, repeatCount]);

  // ---------------------------------------------------------------------------
  // Main Hero Carousel (Approximately 70% of combined hero height, image-only, 5000ms rotation)
  // ---------------------------------------------------------------------------
  const validConfiguredSlides = useMemo(() => {
    return (slides || []).filter((s) => s && s.isEnabled);
  }, [slides]);

  const effectiveSlides = useMemo(() => {
    if (!isSettingsResolved) {
      return [];
    }

    const defaultFallbackUrl = heroImageUrl !== undefined ? (heroImageUrl || '/hero-bg.jpg') : '/hero-bg.jpg';

    if (validConfiguredSlides.length > 0) {
      return validConfiguredSlides.map((s) => {
        const hasCustomImage = typeof s.imageUrl === 'string' && s.imageUrl.trim() !== '';
        return {
          id: s.id,
          imageUrl: hasCustomImage ? s.imageUrl!.trim() : defaultFallbackUrl,
        };
      });
    }

    const fallbackUrl = heroImageUrl !== undefined ? (heroImageUrl || '/hero-bg.jpg') : null;
    return [
      {
        id: 1,
        imageUrl: fallbackUrl || '/hero-bg.jpg',
      },
    ];
  }, [isSettingsResolved, validConfiguredSlides, heroImageUrl]);

  const [activeIndex, setActiveIndex] = useState(0);

  const currentSlideIndex = effectiveSlides.length > 0 ? activeIndex % effectiveSlides.length : 0;
  const currentSlide = effectiveSlides[currentSlideIndex] || null;

  const targetSrc = !isSettingsResolved
    ? (heroImageUrl !== undefined ? (heroImageUrl || '/hero-bg.jpg') : null)
    : (currentSlide ? currentSlide.imageUrl : (heroImageUrl !== undefined ? (heroImageUrl || '/hero-bg.jpg') : null));

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const latestTargetRef = useRef<string | null>(targetSrc);

  // Preloading image with safe event ordering and error fallback
  useEffect(() => {
    latestTargetRef.current = targetSrc;

    if (!targetSrc) {
      setImageSrc(null);
      setIsLoaded(false);
      return;
    }

    let isCancelled = false;
    const img = new Image();

    const handleReady = () => {
      if (isCancelled || latestTargetRef.current !== targetSrc) return;
      setImageSrc(targetSrc);
      setIsLoaded(true);
    };

    const handleError = () => {
      if (isCancelled || latestTargetRef.current !== targetSrc) return;
      setImageSrc('/hero-bg.jpg');
      setIsLoaded(true);
    };

    img.onload = () => {
      if ('decode' in img) {
        img.decode()
          .then(() => handleReady())
          .catch(() => handleReady());
      } else {
        handleReady();
      }
    };
    img.onerror = handleError;

    img.src = targetSrc;

    if (img.complete && img.naturalWidth > 0) {
      handleReady();
    }

    return () => {
      isCancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [targetSrc]);

  // Main hero rotation timer (strictly 5000ms, continuous, no hover pause)
  useEffect(() => {
    if (effectiveSlides.length <= 1 || prefersReducedMotion) {
      return;
    }

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % effectiveSlides.length);
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [activeIndex, effectiveSlides.length, prefersReducedMotion]);

  const handleHeroPrev = useCallback(() => {
    if (effectiveSlides.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + effectiveSlides.length) % effectiveSlides.length);
  }, [effectiveSlides.length]);

  const handleHeroNext = useCallback(() => {
    if (effectiveSlides.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % effectiveSlides.length);
  }, [effectiveSlides.length]);

  const goToSlide = useCallback((index: number) => {
    if (effectiveSlides.length === 0) return;
    setActiveIndex(index % effectiveSlides.length);
  }, [effectiveSlides.length]);

  // Keyboard navigation for main hero
  const handleHeroKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handleHeroPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleHeroNext();
    }
  };

  // Main hero touch swipe
  const heroTouchStartXRef = useRef<number | null>(null);
  const heroTouchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      heroTouchStartXRef.current = e.touches[0].clientX;
      heroTouchStartYRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (heroTouchStartXRef.current === null || heroTouchStartYRef.current === null || e.changedTouches.length === 0) {
      return;
    }
    const deltaX = heroTouchStartXRef.current - e.changedTouches[0].clientX;
    const deltaY = heroTouchStartYRef.current - e.changedTouches[0].clientY;

    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 0) {
        handleHeroNext();
      } else {
        handleHeroPrev();
      }
    }

    heroTouchStartXRef.current = null;
    heroTouchStartYRef.current = null;
  };

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="Homepage Featured Highlights"
      tabIndex={0}
      onKeyDown={handleHeroKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`relative overflow-hidden w-full flex flex-col border-b border-axdoro-border bg-axdoro-bg focus:outline-none ${
        isCategoriesResolved && usableCategories.length > 0
          ? 'h-[480px] sm:h-[580px] md:h-[660px] lg:h-[720px] max-h-[850px]'
          : 'h-[320px] sm:h-[460px] md:h-[560px] lg:h-[640px]'
      }`}
    >
      {/* Keyframe animation definitions */}
      <style>{`
        @keyframes heroProgress {
          0% {
            transform: scaleX(0);
          }
          100% {
            transform: scaleX(1);
          }
        }
        @keyframes categoryMarquee {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-50%, 0, 0);
          }
        }
      `}</style>

      {/* =========================================================================
          LEVEL 1: Top Category Carousel (Approximately 30% of combined hero height)
          Continuous horizontal sliding marquee with 3D product renders
          ========================================================================= */}
      {isCategoriesResolved && usableCategories.length > 0 && (
        <div
          role="region"
          aria-label="Clothing Categories"
          onTouchStart={handleCatTouchStart}
          onTouchMove={handleCatTouchMove}
          onTouchEnd={handleCatTouchEnd}
          onTouchCancel={handleCatTouchEnd}
          className="w-full h-[30%] min-h-0 border-b border-axdoro-border bg-axdoro-surface-muted/90 backdrop-blur-md relative z-20 flex flex-col justify-center overflow-hidden flex-shrink-0 select-none"
        >
          {/* Continuous Category Carousel Track */}
          <div
            data-testid="category-carousel-track"
            className={`flex items-center w-max select-none will-change-transform ${
              prefersReducedMotion ? 'mx-auto justify-center overflow-x-auto max-w-full px-4' : ''
            }`}
            style={{
              animation: prefersReducedMotion ? 'none' : 'categoryMarquee 32s linear infinite',
              animationPlayState: isTouching ? 'paused' : 'running',
              transform: isTouching && touchDeltaX !== 0 ? `translateX(${touchDeltaX}px)` : undefined,
              transition: isTouching ? 'none' : 'transform 0.25s ease-out',
            }}
          >
            {/* Primary accessible sequence */}
            <div className="flex items-center gap-6 sm:gap-10 md:gap-14 px-3 sm:px-6 flex-shrink-0">
              {primarySequence.map((cat, idx) => {
                const isFirstEncounter = idx < usableCategories.length;
                const catImage = cat.imageUrl || DEFAULT_CATEGORY_IMAGES[cat.slug] || GENERIC_CATEGORY_IMAGE;

                return (
                  <button
                    key={`cat-prim-${cat.id || cat.slug}-${idx}`}
                    type="button"
                    tabIndex={isFirstEncounter ? 0 : -1}
                    aria-hidden={!isFirstEncounter ? true : undefined}
                    aria-label={isFirstEncounter ? `View ${cat.name} Collection` : undefined}
                    onClick={() => {
                      if (onNavigate) {
                        onNavigate(`/category/${cat.slug}`);
                      } else {
                        window.location.href = `/category/${cat.slug}`;
                      }
                    }}
                    className="flex flex-col items-center justify-center flex-shrink-0 group cursor-pointer px-3 sm:px-5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded-lg transition-transform hover:scale-105"
                  >
                    {/* Contained 3D Clothing Image */}
                    <div className="relative flex items-center justify-center h-12 sm:h-16 md:h-20 w-16 sm:w-20 md:w-24">
                      <img
                        src={catImage}
                        alt={`${cat.name} Category`}
                        className="max-h-full max-w-full object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] transition-transform duration-300 group-hover:scale-110"
                        loading="eager"
                        onError={(e) => {
                          const target = e.currentTarget;
                          const fbJpg = `/categories/${cat.slug}-3d.jpg`;
                          if (target.src !== fbJpg && !target.src.endsWith(fbJpg)) {
                            target.src = fbJpg;
                          } else {
                            target.src = GENERIC_CATEGORY_IMAGE;
                          }
                        }}
                      />
                    </div>

                    {/* Subtle Pedestal / Base inspired by reference design */}
                    <div className="w-12 sm:w-16 h-1 sm:h-1.5 rounded-full bg-neutral-300/80 group-hover:bg-neutral-400 shadow-sm mx-auto mt-1 transition-colors" />

                    {/* Category Name beneath the image */}
                    <span className="text-[11px] sm:text-xs md:text-sm font-semibold tracking-wider text-axdoro-charcoal group-hover:text-axdoro-accent-muted transition-colors mt-1 whitespace-nowrap">
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Duplicate sequence for seamless continuous marquee loop */}
            {!prefersReducedMotion && (
              <div
                aria-hidden="true"
                className="flex items-center gap-6 sm:gap-10 md:gap-14 px-3 sm:px-6 flex-shrink-0 select-none"
              >
                {primarySequence.map((cat, idx) => {
                  const catImage = cat.imageUrl || DEFAULT_CATEGORY_IMAGES[cat.slug] || GENERIC_CATEGORY_IMAGE;

                  return (
                    <button
                      key={`cat-dup-${cat.id || cat.slug}-${idx}`}
                      type="button"
                      tabIndex={-1}
                      aria-hidden="true"
                      onClick={() => {
                        if (onNavigate) {
                          onNavigate(`/category/${cat.slug}`);
                        } else {
                          window.location.href = `/category/${cat.slug}`;
                        }
                      }}
                      className="flex flex-col items-center justify-center flex-shrink-0 group cursor-pointer px-3 sm:px-5 py-1 focus:outline-none rounded-lg transition-transform hover:scale-105"
                    >
                      {/* Contained 3D Clothing Image */}
                      <div className="relative flex items-center justify-center h-12 sm:h-16 md:h-20 w-16 sm:w-20 md:w-24">
                        <img
                          src={catImage}
                          alt=""
                          aria-hidden="true"
                          className="max-h-full max-w-full object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] transition-transform duration-300 group-hover:scale-110"
                          loading="eager"
                          onError={(e) => {
                            const target = e.currentTarget;
                            const fbJpg = `/categories/${cat.slug}-3d.jpg`;
                            if (target.src !== fbJpg && !target.src.endsWith(fbJpg)) {
                              target.src = fbJpg;
                            } else {
                              target.src = GENERIC_CATEGORY_IMAGE;
                            }
                          }}
                        />
                      </div>

                      {/* Subtle Pedestal / Base inspired by reference design */}
                      <div className="w-12 sm:w-16 h-1 sm:h-1.5 rounded-full bg-neutral-300/80 group-hover:bg-neutral-400 shadow-sm mx-auto mt-1 transition-colors" />

                      {/* Category Name beneath the image */}
                      <span className="text-[11px] sm:text-xs md:text-sm font-semibold tracking-wider text-axdoro-charcoal group-hover:text-axdoro-accent-muted transition-colors mt-1 whitespace-nowrap">
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          LEVEL 2: Main Image Hero Carousel (Approximately 70% of combined hero height)
          Independent, image-only, 5000ms rotation, centered bottom progress dots
          ========================================================================= */}
      <div
        role="region"
        aria-label="Main Hero Slides"
        className={`w-full min-h-0 relative overflow-hidden bg-axdoro-bg ${
          isCategoriesResolved && usableCategories.length > 0 ? 'h-[70%] flex-1' : 'h-full'
        }`}
      >
        {/* Main Carousel Image Only */}
        {imageSrc && (
          <img
            src={imageSrc}
            alt={`AXDORO Featured Hero ${currentSlideIndex + 1}`}
            className={`w-full h-full object-cover object-center transition-opacity duration-500 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            loading="eager"
            onError={() => setImageSrc('/hero-bg.jpg')}
          />
        )}

        {/* Editorial Headline Overlay matching reference */}
        <div className="absolute right-6 sm:right-12 lg:right-16 top-1/2 -translate-y-1/2 max-w-[200px] sm:max-w-xs text-right pointer-events-none select-none z-10">
          <span className="text-xl sm:text-3xl font-serif font-light text-white tracking-wider block drop-shadow-md">
            LOOSE FIT
          </span>
          <span className="text-xl sm:text-3xl font-serif font-bold text-white tracking-tight block drop-shadow-md">
            TROUSERS
          </span>
          <span className="text-xs sm:text-sm text-white/90 font-light tracking-widest uppercase block mt-1 drop-shadow-md">
            To Relax In
          </span>
          <div className="mt-3 sm:mt-4 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                if (onExplore) {
                  onExplore();
                } else if (onNavigate) {
                  onNavigate('/category/pants');
                }
              }}
              className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold uppercase tracking-widest text-white hover:text-axdoro-accent underline underline-offset-4 cursor-pointer transition-colors drop-shadow-md"
            >
              <span>Explore</span>
              <span>&gt;</span>
            </button>
          </div>
        </div>

        {/* Bottom-Center Progress Dots (Exactly 1 dot per enabled slide) */}
        {effectiveSlides.length > 1 && (
          <div className="absolute bottom-4 sm:bottom-5 left-0 right-0 z-10 flex items-center justify-center pointer-events-auto">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10"
              role="tablist"
              aria-label="Slide Selection"
            >
              {effectiveSlides.map((slide, idx) => {
                const isActive = currentSlideIndex === idx;
                return (
                  <button
                    key={slide.id || idx}
                    type="button"
                    role="tab"
                    onClick={() => goToSlide(idx)}
                    aria-selected={isActive}
                    aria-label={`Go to slide ${idx + 1}`}
                    className={`h-2 rounded-full transition-all cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                      isActive
                        ? 'w-7 bg-white/20 relative'
                        : 'w-2 bg-white/30 hover:bg-white/60'
                    }`}
                  >
                    {isActive && (
                      <div
                        key={activeIndex}
                        data-testid="hero-progress-fill"
                        className="h-full bg-axdoro-accent origin-left"
                        style={{
                          width: '100%',
                          transformOrigin: 'left',
                          animation: prefersReducedMotion ? 'none' : 'heroProgress 5000ms linear forwards',
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Screen-reader Live Region for Carousel Accessibility */}
        {effectiveSlides.length > 1 && (
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            Slide {currentSlideIndex + 1} of {effectiveSlides.length}
          </div>
        )}
      </div>
    </section>
  );
};
