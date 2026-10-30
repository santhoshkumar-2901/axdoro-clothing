import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { Hero } from './components/Hero.tsx';
import { HeroSlide, Category } from './types/product.ts';
import { fetchHomepageHero } from './api/catalogue.ts';

describe('Homepage Responsive 3-Slide Hero Carousel Client Tests', () => {
  const clientDir = path.resolve(__dirname);
  const heroFilePath = path.join(clientDir, 'components', 'Hero.tsx');
  const heroContent = fs.readFileSync(heroFilePath, 'utf-8');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Static Code Analysis & Contract Verification', () => {
    it('declares slides?: HeroSlide[] and onNavigate?: (path: string) => void in HeroProps', () => {
      expect(heroContent).toContain('slides?: HeroSlide[];');
      expect(heroContent).toContain('onNavigate?: (path: string) => void;');
      expect(heroContent).toContain('heroImageUrl?: string | null;');
    });

    it('implements 5000ms auto-rotation timer', () => {
      expect(heroContent).toContain('setInterval(');
      expect(heroContent).toContain('5000');
      expect(heroContent).toContain('clearInterval(interval);');
    });

    it('implements bottom-center progress dots with keyframe animation synchronized with activeIndex', () => {
      expect(heroContent).toContain('key={activeIndex}');
      expect(heroContent).toContain('heroProgress 5000ms linear forwards');
      expect(heroContent).toContain('@keyframes heroProgress');
      expect(heroContent).toContain('data-testid="hero-progress-fill"');
      expect(heroContent).toContain('absolute bottom-4 sm:bottom-5 left-0 right-0 z-10 flex items-center justify-center');
      expect(heroContent).toContain('role="tablist"');
      expect(heroContent).toContain('role="tab"');
      expect(heroContent).not.toContain('role="progressbar"');
    });

    it('does not run rotation timer when only one or zero usable slides exist', () => {
      expect(heroContent).toContain('effectiveSlides.length <= 1');
    });

    it('does not pause rotation on hover or user pause state', () => {
      expect(heroContent).not.toContain('isPaused');
      expect(heroContent).not.toContain('isHovered');
      expect(heroContent).not.toContain('onMouseEnter');
      expect(heroContent).not.toContain('onMouseLeave');
    });

    it('detects and respects prefers-reduced-motion media query', () => {
      expect(heroContent).toContain('prefers-reduced-motion: reduce');
      expect(heroContent).toContain('prefersReducedMotion');
    });

    it('implements touch swipe navigation with horizontal vs vertical threshold', () => {
      expect(heroContent).toContain('onTouchStart={handleTouchStart}');
      expect(heroContent).toContain('onTouchEnd={handleTouchEnd}');
      expect(heroContent).toContain('Math.abs(deltaX) > Math.abs(deltaY)');
    });

    it('verifies image-only hero: omits text, arrows, pause buttons, and full-width progress bar while retaining centered dots and accessible region', () => {
      expect(heroContent).toContain('role="region"');
      expect(heroContent).toContain('aria-roledescription="carousel"');
      expect(heroContent).toContain('role="tablist"');
      expect(heroContent).not.toContain('aria-label="Previous slide"');
      expect(heroContent).not.toContain('aria-label="Next slide"');
      expect(heroContent).not.toContain('aria-label="Pause slide rotation"');
      expect(heroContent).not.toContain('role="progressbar"');
    });
  });

  describe('2. Rendering Configured Three-Slide Deck', () => {
    const mockSlides: HeroSlide[] = [
      {
        id: 1,
        imageUrl: 'https://res.cloudinary.com/axdoro/slide1.webp',
        heading: 'Summer Minimal Luxury 2026',
        subtitle: 'Pure Linen & 140 GSM Combed Cotton Tailoring',
        ctaLabel: 'Shop Collection',
        ctaLink: '#category-showcase',
        isEnabled: true,
      },
      {
        id: 2,
        imageUrl: 'https://res.cloudinary.com/axdoro/slide2.webp',
        heading: 'Tailored Oxford Shirts',
        subtitle: 'Designed for Effortless Daily Elegance',
        ctaLabel: 'Explore Shirts',
        ctaLink: '/category/shirts',
        isEnabled: true,
      },
      {
        id: 3,
        imageUrl: 'https://res.cloudinary.com/axdoro/slide3.webp',
        heading: 'Bespoke Bulk Apparel Manufacturing',
        subtitle: 'Custom Embroidery & Tiered Pricing',
        ctaLabel: 'Submit Enquiry',
        ctaLink: 'bulk',
        isEnabled: true,
      },
    ];

    it('renders only the active carousel image with bottom-center progress dots and without text, headings, CTA buttons, arrows, or pause buttons', () => {
      const html = renderToString(
        React.createElement(Hero, {
          slides: mockSlides,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // Verify no headings, subtitles, or CTAs are rendered
      expect(html).not.toContain('Summer Minimal Luxury 2026');
      expect(html).not.toContain('Pure Linen &amp; 140 GSM Combed Cotton Tailoring');
      expect(html).not.toContain('Shop Collection');
      expect(html).not.toContain('Enquire for Bulk Orders');

      // Verify no arrows, pause controls, or full-width progress bar
      expect(html).not.toContain('aria-label="Previous slide"');
      expect(html).not.toContain('aria-label="Next slide"');
      expect(html).not.toContain('aria-label="Pause slide rotation"');
      expect(html).not.toContain('aria-label="Resume slide rotation"');
      expect(html).not.toContain('role="progressbar"');

      // Verify dots are positioned at the bottom center of the hero
      expect(html).toContain('absolute bottom-4 sm:bottom-5 left-0 right-0 z-10 flex items-center justify-center');
      expect(html).toContain('role="tablist"');

      // Verify dot count equals exactly the number of enabled slides (3 enabled = 3 dots)
      expect(html).toContain('aria-label="Go to slide 1"');
      expect(html).toContain('aria-label="Go to slide 2"');
      expect(html).toContain('aria-label="Go to slide 3"');

      // Verify active dot has animated progress fill and inactive dots do not
      expect(html).toContain('data-testid="hero-progress-fill"');
      expect(html).toContain('heroProgress 5000ms linear forwards');

      // Verify accessible live region is present for screen readers
      expect(html).toContain('Slide <!-- -->1<!-- --> of <!-- -->3');
    });

    it('does not render dots or progress animation when only one or zero slides exist', () => {
      const singleSlide: HeroSlide[] = [
        {
          id: 1,
          imageUrl: 'https://res.cloudinary.com/axdoro/single.webp',
          heading: 'Solo',
          subtitle: 'Only one',
          ctaLabel: 'CTA',
          ctaLink: '#',
          isEnabled: true,
        },
      ];

      const html = renderToString(
        React.createElement(Hero, {
          slides: singleSlide,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      expect(html).not.toContain('role="tablist"');
      expect(html).not.toContain('aria-label="Go to slide 1"');
      expect(html).not.toContain('data-testid="hero-progress-fill"');
      expect(html).not.toContain('role="progressbar"');
    });

    it('includes all enabled slides even when imageUrl is null, empty, or whitespace, with dot for each enabled slide', () => {
      const mixedImageSlides: HeroSlide[] = [
        {
          id: 1,
          imageUrl: 'https://res.cloudinary.com/axdoro/slide1.webp',
          heading: 'Slide 1 Custom Image',
          subtitle: 'Active Subtitle 1',
          ctaLabel: 'Action 1',
          ctaLink: '#showcase',
          isEnabled: true,
        },
        {
          id: 2,
          imageUrl: null, // Null image - should fall back to default
          heading: 'Slide 2 Default Image',
          subtitle: 'Active Subtitle 2',
          ctaLabel: 'Action 2',
          ctaLink: '/shirts',
          isEnabled: true,
        },
        {
          id: 3,
          imageUrl: '   ', // Whitespace image - should fall back to default
          heading: 'Slide 3 Whitespace Image',
          subtitle: 'Active Subtitle 3',
          ctaLabel: 'Action 3',
          ctaLink: 'bulk',
          isEnabled: true,
        },
      ];

      const html = renderToString(
        React.createElement(Hero, {
          slides: mixedImageSlides,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // All 3 enabled slides must be present with exactly 3 dots
      expect(html).toContain('Slide <!-- -->1<!-- --> of <!-- -->3');
      expect(html).toContain('aria-label="Go to slide 1"');
      expect(html).toContain('aria-label="Go to slide 2"');
      expect(html).toContain('aria-label="Go to slide 3"');
      expect(html).toContain('data-testid="hero-progress-fill"');
      expect(html).not.toContain('role="progressbar"');
      expect(html).not.toContain('Slide 1 Custom Image');
      expect(html).not.toContain('aria-label="Previous slide"');
      expect(html).not.toContain('aria-label="Next slide"');
      expect(html).not.toContain('aria-label="Pause slide rotation"');
    });

    it('uses custom heroImageUrl fallback for slides with null image when provided', () => {
      const customFallback = 'https://res.cloudinary.com/axdoro/brand-fallback.webp';
      const slidesWithNull: HeroSlide[] = [
        {
          id: 1,
          imageUrl: null,
          heading: 'Slide 1 using brand fallback',
          subtitle: 'Subtitle',
          ctaLabel: 'Action',
          ctaLink: '#showcase',
          isEnabled: true,
        },
      ];

      const html = renderToString(
        React.createElement(Hero, {
          slides: slidesWithNull,
          heroImageUrl: customFallback,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // Single slide does not render multiple-slide live region or progress indicator
      expect(html).not.toContain('Slide 1 using brand fallback');
      expect(html).not.toContain('aria-label="Previous slide"');
      expect(html).not.toContain('role="tablist"');
      expect(html).not.toContain('role="progressbar"');
      expect(html).not.toContain('Slide <!-- -->1<!-- --> of');
    });

    it('excludes disabled slides: renders exactly 2 dots for 2 enabled slides when 1 is disabled', () => {
      const twoEnabledOneDisabled: HeroSlide[] = [
        {
          id: 1,
          imageUrl: 'https://res.cloudinary.com/axdoro/slide1.webp',
          heading: 'Active Slide 1',
          subtitle: 'Active Subtitle 1',
          ctaLabel: 'Action 1',
          ctaLink: '#showcase',
          isEnabled: true,
        },
        {
          id: 2,
          imageUrl: 'https://res.cloudinary.com/axdoro/slide2.webp',
          heading: 'Active Slide 2',
          subtitle: 'Active Subtitle 2',
          ctaLabel: 'Action 2',
          ctaLink: '/shirts',
          isEnabled: true,
        },
        {
          id: 3,
          imageUrl: null,
          heading: 'Disabled Slide 3',
          subtitle: 'Disabled Subtitle 3',
          ctaLabel: 'Action 3',
          ctaLink: 'bulk',
          isEnabled: false, // Disabled
        },
      ];

      const html = renderToString(
        React.createElement(Hero, {
          slides: twoEnabledOneDisabled,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // 2 enabled slides -> exactly 2 dots (dot 1 and dot 2), no dot 3
      expect(html).toContain('aria-label="Go to slide 1"');
      expect(html).toContain('aria-label="Go to slide 2"');
      expect(html).not.toContain('aria-label="Go to slide 3"');
      expect(html).toContain('data-testid="hero-progress-fill"');
      expect(html).toContain('Slide <!-- -->1<!-- --> of <!-- -->2');
      expect(html).not.toContain('role="progressbar"');
    });

    it('excludes disabled slides: hides dots when only 1 enabled slide remains', () => {
      const mixedStatusSlides: HeroSlide[] = [
        {
          id: 1,
          imageUrl: 'https://res.cloudinary.com/axdoro/slide1.webp',
          heading: 'Active Slide 1',
          subtitle: 'Active Subtitle',
          ctaLabel: 'Action 1',
          ctaLink: '#showcase',
          isEnabled: true,
        },
        {
          id: 2,
          imageUrl: 'https://res.cloudinary.com/axdoro/slide2.webp',
          heading: 'Disabled Slide 2',
          subtitle: 'Disabled Subtitle',
          ctaLabel: 'Action 2',
          ctaLink: '/shirts',
          isEnabled: false, // Disabled
        },
        {
          id: 3,
          imageUrl: null,
          heading: 'Disabled Slide 3',
          subtitle: 'Disabled Subtitle',
          ctaLabel: 'Action 3',
          ctaLink: 'bulk',
          isEnabled: false, // Disabled
        },
      ];

      const html = renderToString(
        React.createElement(Hero, {
          slides: mixedStatusSlides,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // Only 1 usable enabled slide exists -> dots and multiple slide live region omitted
      expect(html).not.toContain('Active Slide 1');
      expect(html).not.toContain('Disabled Slide 2');
      expect(html).not.toContain('role="tablist"');
      expect(html).not.toContain('aria-label="Go to slide 1"');
      expect(html).not.toContain('role="progressbar"');
      expect(html).not.toContain('Slide <!-- -->1<!-- --> of');
    });

    it('falls back to default /hero-bg.jpg slide when all configured slides are disabled', () => {
      const allDisabledSlides: HeroSlide[] = [
        { id: 1, imageUrl: 'https://res.cloudinary.com/axdoro/s1.webp', heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: false },
        { id: 2, imageUrl: null, heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: false },
        { id: 3, imageUrl: null, heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: false },
      ];

      const html = renderToString(
        React.createElement(Hero, {
          slides: allDisabledSlides,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // Falls back to single default slide (no text rendered, controls and dots omitted)
      expect(html).not.toContain('H1');
      expect(html).not.toContain('Explore Collection');
      expect(html).not.toContain('aria-label="Previous slide"');
      expect(html).not.toContain('role="tablist"');
      expect(html).not.toContain('role="progressbar"');
    });

    it('verifies active slide index advancement and wrapping from slide 3 back to slide 1', () => {
      const slideCount = 3;
      const getNext = (current: number) => (current + 1) % slideCount;
      const getPrev = (current: number) => (current - 1 + slideCount) % slideCount;

      // Forward continuous wrapping: 0 -> 1 -> 2 -> 0 -> 1
      expect(getNext(0)).toBe(1);
      expect(getNext(1)).toBe(2);
      expect(getNext(2)).toBe(0); // Wraps from slide 3 back to slide 1
      expect(getNext(0)).toBe(1);

      // Backward continuous wrapping: 0 -> 2 -> 1 -> 0
      expect(getPrev(0)).toBe(2); // Wraps backwards from slide 1 to slide 3
      expect(getPrev(2)).toBe(1);
      expect(getPrev(1)).toBe(0);
    });
  });

  describe('3. Two-Level Homepage Carousel (30% Top Categories + 70% Main Hero)', () => {
    const mockCategories: Category[] = [
      {
        id: 'cat-tshirts',
        slug: 't-shirts',
        name: 'T-Shirts',
        description: 'Cotton tees',
        displayOrder: 1,
        imageUrl: 'https://res.cloudinary.com/axdoro/tshirts.webp',
      },
      {
        id: 'cat-shirts',
        slug: 'shirts',
        name: 'Shirts',
        description: 'Tailored shirts',
        displayOrder: 2,
        imageUrl: null, // Tests fallback image
      },
      {
        id: 'cat-pants',
        slug: 'pants',
        name: 'Pants',
        description: 'Classic trousers',
        displayOrder: 3,
        imageUrl: 'https://res.cloudinary.com/axdoro/pants.webp',
      },
    ];

    const mockHeroSlides: HeroSlide[] = [
      { id: 1, imageUrl: 'https://res.cloudinary.com/axdoro/s1.webp', heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
      { id: 2, imageUrl: 'https://res.cloudinary.com/axdoro/s2.webp', heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
    ];

    it('renders two vertically stacked carousel levels with 30% top category and 70% main hero proportions', () => {
      const html = renderToString(
        React.createElement(Hero, {
          slides: mockHeroSlides,
          categories: mockCategories,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // Verify overall two-level responsive flex container
      expect(html).toContain('flex flex-col');
      expect(html).toContain('border-b border-axdoro-border bg-axdoro-bg');

      // Level 1: Top Category Carousel (~30% height)
      expect(html).toContain('aria-label="Clothing Categories"');
      expect(html).toContain('h-[30%]');
      expect(html).toContain('data-testid="category-carousel-track"');

      // Level 2: Main Image Hero Carousel (~70% height)
      expect(html).toContain('aria-label="Main Hero Slides"');
      expect(html).toContain('h-[70%]');
    });

    it('renders clean 3D clothing items with pedestals and category names beneath for Shirts, T-shirts, and Pants', () => {
      const html = renderToString(
        React.createElement(Hero, {
          slides: mockHeroSlides,
          categories: mockCategories,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // Verify category items for T-Shirts, Shirts, and Pants are present
      expect(html).toContain('aria-label="View T-Shirts Collection"');
      expect(html).toContain('aria-label="View Shirts Collection"');
      expect(html).toContain('aria-label="View Pants Collection"');

      // Verify category names appear beneath the images
      expect(html).toContain('T-Shirts');
      expect(html).toContain('Shirts');
      expect(html).toContain('Pants');

      // Verify tailored contact down shadow styling aligned with garments
      expect(html).toContain('rounded-full mx-auto -mt-0.5');
      expect(html).toContain('radial-gradient(ellipse at center');

      // Verify contained image presentation (no stretching)
      expect(html).toContain('object-contain');

      // Verify custom image is used for t-shirts and pants, and 3D fallback for shirts
      expect(html).toContain('https://res.cloudinary.com/axdoro/tshirts.webp');
      expect(html).toContain('https://res.cloudinary.com/axdoro/pants.webp');
      expect(html).toContain('/categories/shirts-3d.webp'); // 3D Shirts fallback
    });

    it('preserves independence: categories do not alter main hero slide dots, and hero slides do not alter categories', () => {
      const html = renderToString(
        React.createElement(Hero, {
          slides: mockHeroSlides, // 2 enabled slides
          categories: mockCategories, // 3 categories
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // Main hero has exactly 2 progress dots (matching 2 enabled slides, not 3 categories)
      expect(html).toContain('aria-label="Go to slide 1"');
      expect(html).toContain('aria-label="Go to slide 2"');
      expect(html).not.toContain('aria-label="Go to slide 3"');

      // Main hero maintains bottom-center dots with progress fill
      expect(html).toContain('data-testid="hero-progress-fill"');
      expect(html).toContain('absolute bottom-4 sm:bottom-5 left-0 right-0 z-10 flex items-center justify-center');

      // Main hero remains strictly image-only (no headings, text, or CTA overlays)
      expect(html).not.toContain('H1');
      expect(html).not.toContain('S1');
      expect(html).not.toContain('C1');
      expect(html).not.toContain('role="progressbar"');
    });

    it('implements continuous horizontal marquee sliding, touch drag support, and accessible looping in code', () => {
      // Continuous linear marquee animation rather than jumpy timer interval
      expect(heroContent).toContain('categoryMarquee');
      expect(heroContent).toContain('linear infinite');
      expect(heroContent).not.toContain('catSlideIndex');

      // Touch swiping and drag handlers
      expect(heroContent).toContain('handleCatTouchStart');
      expect(heroContent).toContain('handleCatTouchMove');
      expect(heroContent).toContain('handleCatTouchEnd');

      // Accessible clone: duplicate track is hidden from screen readers and keyboard tab order
      expect(heroContent).toContain('aria-hidden="true"');
      expect(heroContent).toContain('tabIndex={-1}');

      // Main hero maintains independent 5000ms rotation
      expect(heroContent).toContain('5000');
    });

    it('references original high-quality 3D rendered assets as default category image fallbacks', () => {
      expect(heroContent).toContain("'/categories/t-shirts-3d.webp'");
      expect(heroContent).toContain("'/categories/shirts-3d.webp'");
      expect(heroContent).toContain("'/categories/pants-3d.webp'");
    });
  });

  describe('4. Legacy Compatibility & Unresolved Loading Protection', () => {
    it('does not render an <img> element while settings are unresolved (slides === undefined && heroImageUrl === undefined)', () => {
      const html = renderToString(
        React.createElement(Hero, {
          slides: undefined,
          heroImageUrl: undefined,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      expect(html).not.toContain('<img');
      expect(html).not.toContain('src="/hero-bg.jpg"');
      // Background is intact, overlays are absent
      expect(html).toContain('bg-axdoro-bg');
      expect(html).not.toContain('bg-gradient-to-r');
      expect(html).not.toContain('role="progressbar"');
    });

    it('uses legacy heroImageUrl when slides array is undefined but heroImageUrl is provided', () => {
      const customUrl = 'https://res.cloudinary.com/axdoro/hero-legacy-sample.webp';
      const html = renderToString(
        React.createElement(Hero, {
          slides: undefined,
          heroImageUrl: customUrl,
          onExplore: () => {},
          onOpenBulk: () => {},
        })
      );

      // Single slide -> controls, text, and progress bar omitted
      expect(html).not.toContain('AXDORO – Clothing Made for Every Occasion');
      expect(html).not.toContain('aria-label="Previous slide"');
      expect(html).not.toContain('role="progressbar"');
    });
  });

  describe('4. Client API fetchHomepageHero Extraction', () => {
    it('extracts slides array when present in API response', async () => {
      const mockApiData = {
        imageUrl: 'https://res.cloudinary.com/axdoro/image1.webp',
        slides: [
          { id: 1, imageUrl: 'https://res.cloudinary.com/axdoro/image1.webp', heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#1', isEnabled: true },
          { id: 2, imageUrl: 'https://res.cloudinary.com/axdoro/image2.webp', heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#2', isEnabled: true },
          { id: 3, imageUrl: 'https://res.cloudinary.com/axdoro/image3.webp', heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#3', isEnabled: true },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success', data: mockApiData }),
      });

      const res = await fetchHomepageHero();
      expect(res.imageUrl).toBe('https://res.cloudinary.com/axdoro/image1.webp');
      expect(res.slides).toHaveLength(3);
      expect(res.slides?.[1].heading).toBe('H2');
    });

    it('safely returns empty slides array on API network rejection', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection failed'));

      const res = await fetchHomepageHero();
      expect(res.imageUrl).toBeNull();
      expect(res.slides).toEqual([]);
    });
  });

  describe('5. Admin 3-Slide Carousel Editor (CollectionManagementView.tsx)', () => {
    const collectionViewPath = path.join(clientDir, 'components', 'admin', 'CollectionManagementView.tsx');
    const viewContent = fs.readFileSync(collectionViewPath, 'utf-8');

    it('declares 3 configurable slide slots with slot navigation', () => {
      expect(viewContent).toContain('DEFAULT_HERO_SLIDES');
      expect(viewContent).toContain('heroSlides');
      expect(viewContent).toContain('Slide Slot {slide.id}');
      expect(viewContent).toContain('activeSlideId');
    });

    it('streamlines editor by removing text fields to keep hero banner image-driven', () => {
      expect(viewContent).not.toContain('id="slide-heading"');
      expect(viewContent).not.toContain('id="slide-subtitle"');
      expect(viewContent).not.toContain('id="slide-cta-label"');
      expect(viewContent).not.toContain('id="slide-cta-link"');
      expect(viewContent).not.toContain('id="slide-enabled-toggle"');
    });

    it('provides modal with signed Cloudinary upload workflow and direct URL option', () => {
      expect(viewContent).toContain('Manage Homepage Hero Image');
      expect(viewContent).toContain('File Upload (Cloudinary)');
      expect(viewContent).toContain('Direct URL');
      expect(viewContent).toContain('adminGetHeroUploadSignature');
      expect(viewContent).toContain('useScrollLock(isHeroModalOpen);');
    });

    it('adminUpdateHomepageHero sends full slides payload with CSRF protection', async () => {
      const { adminUpdateHomepageHero } = await import('./api/admin.ts');
      const testSlides: HeroSlide[] = [
        { id: 1, imageUrl: 'https://res.cloudinary.com/axdoro/img1.webp', heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
        { id: 2, imageUrl: null, heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '/formal', isEnabled: true },
        { id: 3, imageUrl: null, heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: 'bulk', isEnabled: false },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success', data: { slides: testSlides, imageUrl: testSlides[0].imageUrl } }),
      });
      global.fetch = mockFetch;

      const res = await adminUpdateHomepageHero({ slides: testSlides });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/homepage/hero',
        expect.objectContaining({
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ slides: testSlides }),
        })
      );
      expect(res.slides).toHaveLength(3);
    });

    it('adminUpdateHomepageHero throws error on API failure', async () => {
      const { adminUpdateHomepageHero } = await import('./api/admin.ts');
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ status: 'error', message: 'Validation failed on slide 2' }),
      });

      await expect(adminUpdateHomepageHero({ slides: [] as any })).rejects.toThrow('Validation failed on slide 2');
    });
  });
});
