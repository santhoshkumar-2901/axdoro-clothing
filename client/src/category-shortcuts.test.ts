import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { CategoryShortcutItem } from './types/product.ts';
import { CategorySectionBlock } from './components/CategorySectionBlock.tsx';

describe('AXDORO — Image-Based Category Cards (Phase 2)', () => {
  const clientDir = path.resolve(__dirname);

  describe('1. Type & Interface Integrity', () => {
    it('exports CategoryShortcutItem interface with required id, label, imageUrl, and optional sublabel, query', () => {
      const shortcut: CategoryShortcutItem = {
        id: 'test-korean',
        label: 'Korean',
        sublabel: 'Trousers',
        imageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600',
        query: 'Korean',
      };

      expect(shortcut.id).toBe('test-korean');
      expect(shortcut.label).toBe('Korean');
      expect(shortcut.sublabel).toBe('Trousers');
      expect(shortcut.imageUrl).toContain('images.unsplash.com');
      expect(shortcut.query).toBe('Korean');
    });
  });

  describe('2. Component Markup & Design Specification Verification', () => {
    const sampleShortcuts: CategoryShortcutItem[] = [
      {
        id: 'pants-bootcut',
        label: 'Bootcut',
        sublabel: 'Pants',
        imageUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600',
        query: 'Bootcut',
      },
      {
        id: 'pants-korean',
        label: 'Korean',
        sublabel: 'Trousers',
        imageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600',
        query: 'Korean',
      },
    ];

    it('renders portrait cards with aspect-[3/4], rounded-xl, and responsive dimensions', () => {
      const html = renderToString(
        React.createElement(CategorySectionBlock, {
          categorySlug: 'pants',
          title: 'Pants & Trousers',
          shortcuts: sampleShortcuts,
          viewAllLink: '/category/pants',
          onQuickView: () => {},
          onAddToCart: () => {},
        })
      );

      // Card container classes
      expect(html).toContain('aspect-[3/4]');
      expect(html).toContain('rounded-xl');
      expect(html).toContain('w-28');
      expect(html).toContain('sm:w-36');
      expect(html).toContain('md:w-40');
      expect(html).toContain('overflow-hidden');
    });

    it('renders dark gradient overlay and white bold typography at bottom of card', () => {
      const html = renderToString(
        React.createElement(CategorySectionBlock, {
          categorySlug: 'pants',
          title: 'Pants & Trousers',
          shortcuts: sampleShortcuts,
          viewAllLink: '/category/pants',
          onQuickView: () => {},
          onAddToCart: () => {},
        })
      );

      // Gradient overlay
      expect(html).toContain('bg-gradient-to-t from-black/85 via-black/35 to-transparent');

      // White typography
      expect(html).toContain('Bootcut');
      expect(html).toContain('Pants');
      expect(html).toContain('Korean');
      expect(html).toContain('Trousers');
      expect(html).toContain('text-white');
      expect(html).toContain('font-extrabold');
      expect(html).toContain('uppercase');
    });

    it('implements accessibility landmarks, ARIA pressed, and reduced motion styling', () => {
      const html = renderToString(
        React.createElement(CategorySectionBlock, {
          categorySlug: 'pants',
          title: 'Pants & Trousers',
          shortcuts: sampleShortcuts,
          viewAllLink: '/category/pants',
          onQuickView: () => {},
          onAddToCart: () => {},
        })
      );

      // Accessibility
      expect(html).toContain('role="region"');
      expect(html).toContain('aria-label="Pants &amp; Trousers Category Shortcuts"');
      expect(html).toContain('aria-pressed="false"');
      expect(html).toContain('aria-label="Bootcut Pants filter"');

      // Keyboard focus ring
      expect(html).toContain('focus-visible:ring-neutral-900');

      // Motion handling
      expect(html).toContain('motion-safe:group-hover:scale-105');
      expect(html).toContain('motion-reduce:transform-none');
    });

    it('supports backward-compatibility with plain string shortcut arrays', () => {
      const html = renderToString(
        React.createElement(CategorySectionBlock, {
          categorySlug: 'shirts',
          title: 'Topwear & Shirts',
          shortcuts: ['Oxford', 'Cuban Collar'],
          viewAllLink: '/category/shirts',
          onQuickView: () => {},
          onAddToCart: () => {},
        })
      );

      expect(html).toContain('Oxford');
      expect(html).toContain('Cuban Collar');
      expect(html).toContain('aspect-[3/4]');
    });
  });

  describe('3. App.tsx Shortcuts Configuration & Jeans Architecture', () => {
    const appPath = path.join(clientDir, 'App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf-8');

    it('configures all 8 required Pants shortcuts in App.tsx', () => {
      expect(appContent).toContain("'Bootcut'");
      expect(appContent).toContain("'Korean'");
      expect(appContent).toContain("'Gurkha'");
      expect(appContent).toContain("'Pleated'");
      expect(appContent).toContain("'Baggy'");
      expect(appContent).toContain("'Relaxed'");
      expect(appContent).toContain("'Wide Leg'");
      expect(appContent).toContain("'Straight Fit'");
    });

    it('configures all 4 required Shirts shortcuts in App.tsx', () => {
      expect(appContent).toContain("'Oxford'");
      expect(appContent).toContain("'Cuban Collar'");
      expect(appContent).toContain("'Linen Blend'");
      expect(appContent).toContain("'Overshirt'");
    });

    it('configures all 4 required T-Shirts shortcuts in App.tsx', () => {
      expect(appContent).toContain("'140 GSM'");
      expect(appContent).toContain("'Crewneck'");
      expect(appContent).toContain("'Pocket Tee'");
      expect(appContent).toContain("'Heavyweight'");
    });

    it('verifies Jeans fits cleanly into existing architecture without duplicate backend categories', () => {
      // Jeans is incorporated as a cut shortcut (Baggy Jeans) in the Pants section
      expect(appContent).toContain("id: 'pants-baggy-jeans'");
      expect(appContent).toContain("sublabel: 'Jeans'");
      // Does not introduce duplicate or invented categorySlug="jeans" section blocks
      expect(appContent).not.toContain('categorySlug="jeans"');
    });

    it('verifies all category shortcut image URLs use secure, existing image sources', () => {
      expect(appContent).toContain('PANTS_SHORTCUTS');
      expect(appContent).toContain('SHIRTS_SHORTCUTS');
      expect(appContent).toContain('TSHIRTS_SHORTCUTS');
      expect(appContent).toContain('https://images.unsplash.com/photo-1541099649105-f69ad21f3246');
      expect(appContent).toContain('https://images.unsplash.com/photo-1596755094514-f87e34085b2c');
      expect(appContent).toContain('https://images.unsplash.com/photo-1581655353564-df123a1eb820');
    });

    it('configures editorial banners for Pants, Shirts, and T-Shirts in App.tsx', () => {
      // Pants banner
      expect(appContent).toContain('bannerTitle="Loose Fit Pleated Pants"');
      // Shirts banner
      expect(appContent).toContain('bannerTitle="Curated Topwear"');
      // T-Shirts banner
      expect(appContent).toContain('bannerTitle="140 GSM Combed Cotton Essentials"');
      // Lifestyle / Jeans banner removed per request
      expect(appContent).not.toContain('Signature Daily Wear');
    });
  });

  describe('4. Full-Width Editorial Category Banner Layout', () => {
    it('renders full-width rectangular banner with zero left/right gaps and no rounded corners', () => {
      const html = renderToString(
        React.createElement(CategorySectionBlock, {
          categorySlug: 'pants',
          title: 'Pants & Trousers',
          bannerImage: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1600',
          bannerTitle: 'Loose Fit Pleated Pants',
          bannerSubtitle: 'Architectural drape cut from tailored cotton-blend foundations',
          viewAllLink: '/category/pants',
          onQuickView: () => {},
          onAddToCart: () => {},
        })
      );

      // Full-width rectangular container
      expect(html).toContain('w-full relative aspect-[16/7] sm:aspect-[21/8] overflow-hidden');
      // Must not have rounded-xl or rounded-2xl on the full-bleed banner
      const bannerIndex = html.indexOf('w-full relative aspect-[16/7]');
      const bannerMarkup = html.slice(bannerIndex, bannerIndex + 300);
      expect(bannerMarkup).not.toContain('rounded-xl');
      expect(bannerMarkup).not.toContain('rounded-2xl');

      // Image presentation
      expect(bannerMarkup).toContain('object-cover object-center');

      // Gradient overlay and typography hierarchy
      expect(html).toContain('bg-gradient-to-t from-black/75 via-black/25 to-transparent');
      expect(html).toContain('Loose Fit Pleated Pants');
      expect(html).toContain('Architectural drape cut from tailored cotton-blend foundations');
      expect(html).toContain('font-serif font-bold tracking-tight uppercase');
    });
  });
});
