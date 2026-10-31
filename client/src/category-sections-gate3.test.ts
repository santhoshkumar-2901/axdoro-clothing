import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { CategorySectionBlock } from './components/CategorySectionBlock.tsx';
import { CategorySectionModal } from './components/admin/CategorySectionModal.tsx';
import { CategorySectionReorderModal } from './components/admin/CategorySectionReorderModal.tsx';
import { PublicCategorySection } from './api/catalogue.ts';
import { AdminCategory, CategorySectionCard } from './api/admin.ts';

describe('Gate 3: Admin UI & Dynamic Homepage Category Sections', () => {
  const sampleShortcuts: CategorySectionCard[] = [
    {
      id: 'sc-bootcut',
      label: 'Bootcut',
      sublabel: 'Pants',
      imageUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600',
      destinationType: 'query',
      query: 'Bootcut',
    },
    {
      id: 'sc-shoes',
      label: 'Footwear Collection',
      sublabel: 'Trending',
      imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',
      destinationType: 'category',
      destinationCategorySlug: 'shoes',
    },
  ];

  describe('1. Storefront Component: CategorySectionBlock Dynamic Rendering', () => {
    it('renders centered heading, subtitle, shortcuts, poster, and view all label', () => {
      const html = renderToString(
        React.createElement(CategorySectionBlock, {
          id: 'pants-section',
          categorySlug: 'pants',
          title: 'Pants & Trousers',
          subtitle: 'Relaxed, pleated, and contemporary cuts engineered for all-day comfort',
          shortcuts: sampleShortcuts,
          bannerImage: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1600',
          bannerTitle: 'Loose Fit Pleated Pants',
          bannerSubtitle: 'Architectural drape cut from tailored cotton-blend foundations',
          bannerDestinationUrl: '/category/pants',
          productLimit: 4,
          viewAllLabel: 'Explore All Pants',
          viewAllLink: '/category/pants',
          onQuickView: () => {},
          onAddToCart: () => {},
        })
      );

      // Centered heading & subtitle
      expect(html).toContain('Pants &amp; Trousers');
      expect(html).toContain('Relaxed, pleated, and contemporary cuts');
      expect(html).toContain('mb-8 text-center max-w-2xl mx-auto');

      // Shortcut cards
      expect(html).toContain('Bootcut');
      expect(html).toContain('Pants');
      expect(html).toContain('Footwear Collection');

      // Promotional poster
      expect(html).toContain('Loose Fit Pleated Pants');
      expect(html).toContain('Architectural drape cut from tailored cotton-blend foundations');
      expect(html).toContain('https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1600');

      // Dynamic view all label
      expect(html).toContain('Explore All Pants');
    });

    it('renders dynamic newly created categories (e.g. Shoes) without requiring code changes', () => {
      const shoesSection: PublicCategorySection = {
        id: 'sec-shoes-123',
        categoryId: 'cat-shoes-1',
        category: {
          id: 'cat-shoes-1',
          name: 'Shoes',
          slug: 'shoes',
          description: 'Contemporary footwear collection',
        },
        isEnabled: true,
        displayOrder: 4,
        heading: 'Shoes & Footwear',
        subtitle: 'Artisanal sneakers, boots, and loafers',
        categoryCards: [
          {
            id: 'shoes-sneakers',
            label: 'Sneakers',
            sublabel: 'Casual',
            imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff',
            destinationType: 'query',
            query: 'Sneakers',
          },
        ],
        posterImageUrl: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=1600',
        posterHeading: 'Urban Footwear Series',
        posterSubtitle: 'Engineered lightweight leather runners',
        posterDestinationUrl: '/category/shoes',
        productLimit: 8,
        viewAllLabel: 'Discover Shoes',
        viewAllDestination: '/category/shoes',
      };

      const html = renderToString(
        React.createElement(CategorySectionBlock, {
          id: `${shoesSection.category.slug}-section`,
          categorySlug: shoesSection.category.slug,
          title: shoesSection.heading,
          subtitle: shoesSection.subtitle || undefined,
          shortcuts: shoesSection.categoryCards,
          bannerImage: shoesSection.posterImageUrl || undefined,
          bannerTitle: shoesSection.posterHeading || undefined,
          bannerSubtitle: shoesSection.posterSubtitle || undefined,
          bannerDestinationUrl: shoesSection.posterDestinationUrl || undefined,
          productLimit: shoesSection.productLimit,
          viewAllLabel: shoesSection.viewAllLabel,
          viewAllLink: shoesSection.viewAllDestination || `/category/${shoesSection.category.slug}`,
          onQuickView: () => {},
          onAddToCart: () => {},
        })
      );

      expect(html).toContain('Shoes &amp; Footwear');
      expect(html).toContain('Artisanal sneakers, boots, and loafers');
      expect(html).toContain('Sneakers');
      expect(html).toContain('Urban Footwear Series');
      expect(html).toContain('Discover Shoes');
    });

    it('renders gracefully without optional promotional poster', () => {
      const html = renderToString(
        React.createElement(CategorySectionBlock, {
          categorySlug: 'accessories',
          title: 'Accessories',
          viewAllLink: '/category/accessories',
          onQuickView: () => {},
          onAddToCart: () => {},
        })
      );

      expect(html).toContain('Accessories');
      expect(html).toContain('View All');
      // No poster banner element rendered
      expect(html).not.toContain('aspect-[16/7]');
    });
  });

  describe('2. Storefront Zero-Result Filter Safety Requirement', () => {
    it('verifies CategorySectionBlock contains explicit zero-result empty state and clear button', () => {
      // Inspect component code directly to confirm filter behavior
      const fs = require('node:fs');
      const path = require('node:path');
      const blockCode = fs.readFileSync(
        path.join(__dirname, 'components/CategorySectionBlock.tsx'),
        'utf-8'
      );

      // Verify that when filtered results have 0 products, it does NOT fall back to all products
      expect(blockCode).toContain('activeShortcut ?');
      expect(blockCode).toContain('No products found matching');
      expect(blockCode).toContain('Clear filter');
      expect(blockCode).toContain('setActiveShortcut(null)');
    });
  });

  describe('3. Admin UI: CategorySectionModal Form & Safety Rules', () => {
    const sampleCategory: AdminCategory = {
      id: 'cat-100',
      name: 'Pants',
      slug: 'pants',
      description: 'Bottomwear and trousers',
      displayOrder: 1,
      isActive: true,
      productCount: 12,
      createdAt: '2026-01-01',
      section: {
        id: 'sec-100',
        isEnabled: true,
        displayOrder: 1,
        heading: 'Pants & Trousers',
      },
    };

    it('renders CategorySectionModal with section heading and settings when open', () => {
      const html = renderToString(
        React.createElement(CategorySectionModal, {
          category: sampleCategory,
          isOpen: true,
          onClose: () => {},
          onSaved: () => {},
          allCategories: [sampleCategory],
        })
      );

      expect(html).toContain('Homepage Section:');
      expect(html).toContain('Pants');
      expect(html).toContain('Show on Homepage');
      expect(html).toContain('Section Heading');
      expect(html).toContain('Product Limit');
      expect(html).toContain('Category Shortcut Cards');
      expect(html).toContain('Full-Width Promotional Poster Banner (Optional)');
      expect(html).toContain('Save Homepage Section');
    });

    it('returns null when modal is closed', () => {
      const html = renderToString(
        React.createElement(CategorySectionModal, {
          category: sampleCategory,
          isOpen: false,
          onClose: () => {},
          onSaved: () => {},
          allCategories: [sampleCategory],
        })
      );

      expect(html).toBe('');
    });
  });

  describe('4. Admin UI: CategorySectionReorderModal Complete List Requirement', () => {
    const categoriesWithSections: AdminCategory[] = [
      {
        id: 'cat-1',
        name: 'Pants',
        slug: 'pants',
        displayOrder: 1,
        isActive: true,
        productCount: 10,
        createdAt: '2026-01-01',
        section: {
          id: 'sec-1',
          isEnabled: true,
          displayOrder: 1,
          heading: 'Pants & Trousers',
        },
      },
      {
        id: 'cat-2',
        name: 'Shirts',
        slug: 'shirts',
        displayOrder: 2,
        isActive: true,
        productCount: 8,
        createdAt: '2026-01-01',
        section: {
          id: 'sec-2',
          isEnabled: false, // Disabled section must still be included in reorder!
          displayOrder: 2,
          heading: 'Topwear & Shirts',
        },
      },
      {
        id: 'cat-3',
        name: 'T-Shirts',
        slug: 't-shirts',
        displayOrder: 3,
        isActive: true,
        productCount: 15,
        createdAt: '2026-01-01',
        section: {
          id: 'sec-3',
          isEnabled: true,
          displayOrder: 3,
          heading: 'T-Shirts & Essentials',
        },
      },
    ];

    it('renders all configured sections including disabled sections', () => {
      const html = renderToString(
        React.createElement(CategorySectionReorderModal, {
          isOpen: true,
          onClose: () => {},
          onReordered: () => {},
          categories: categoriesWithSections,
        })
      );

      expect(html).toContain('Reorder Homepage Sections');
      expect(html).toContain('Pants &amp; Trousers');
      expect(html).toContain('Topwear &amp; Shirts');
      expect(html).toContain('T-Shirts &amp; Essentials');

      // Both Enabled and Disabled badges visible
      expect(html).toContain('Enabled');
      expect(html).toContain('Disabled');
      expect(html).toContain('Save Section Order');
    });

    it('returns null when reorder modal is closed', () => {
      const html = renderToString(
        React.createElement(CategorySectionReorderModal, {
          isOpen: false,
          onClose: () => {},
          onReordered: () => {},
          categories: categoriesWithSections,
        })
      );

      expect(html).toBe('');
    });
  });

  describe('4. Cloudinary Upload Parameter Integrity', () => {
    it('verifies CategorySectionModal passes unaltered signatureConfig.publicId without custom suffixes', async () => {
      const fs = await import('node:fs');
      const modalSrc = fs.readFileSync(
        new URL('./components/admin/CategorySectionModal.tsx', import.meta.url),
        'utf-8'
      );
      // Confirms exact signatureConfig.publicId is passed
      expect(modalSrc).toContain("formData.append('public_id', signatureConfig.publicId);");
      // Confirms invalid custom suffixes are NOT appended
      expect(modalSrc).not.toContain("${signatureConfig.publicId}-poster-");
      expect(modalSrc).not.toContain("${signatureConfig.publicId}-card-");
    });
  });
});
