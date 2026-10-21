import React, { useState, useEffect } from 'react';
import { Product, HomepageCollection } from '../types/product.ts';
import { ProductCard } from './ProductCard.tsx';
import {
  fetchHomepageCollections,
  fetchHomepageCollectionBySlug,
} from '../api/catalogue.ts';
import { Sparkles, ArrowRight } from 'lucide-react';

export interface HomepageCollectionSectionProps {
  slug?: string;
  collection?: HomepageCollection;
  badgeText?: string;
  variant?: 'default' | 'alternate';
  className?: string;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size: string, color: string) => void;
  onNavigateCategory?: (categorySlug: string) => void;
}

/**
 * Renders an independent, admin-curated collection section on the homepage
 * (e.g. "This Month's Best Sellers" or "Signature Picks").
 */
export const HomepageCollectionSection: React.FC<HomepageCollectionSectionProps> = ({
  slug,
  collection: propCollection,
  badgeText = 'Curated Selection',
  variant = 'default',
  className = '',
  onQuickView,
  onAddToCart,
  onNavigateCategory,
}) => {
  const [collection, setCollection] = useState<HomepageCollection | null>(
    propCollection || null
  );
  const [isLoading, setIsLoading] = useState<boolean>(!propCollection && Boolean(slug));

  useEffect(() => {
    if (propCollection) {
      setCollection(propCollection);
      setIsLoading(false);
      return;
    }

    if (!slug) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    fetchHomepageCollectionBySlug(slug)
      .then((data) => {
        if (isMounted) {
          setCollection(data);
        }
      })
      .catch((err) => {
        console.warn(`[HomepageCollectionSection] Failed to load collection '${slug}':`, err);
        if (isMounted) {
          setCollection(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [slug, propCollection]);

  // If loading, disabled/not found, or has no eligible products, render nothing
  if (isLoading || !collection || !Array.isArray(collection.products) || collection.products.length === 0) {
    return null;
  }

  const isAlternate = variant === 'alternate';

  return (
    <section
      id={`collection-${collection.slug}`}
      data-testid={`collection-section-${collection.slug}`}
      className={`py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto rounded-2xl transition-all duration-300 my-12 ${
        isAlternate
          ? 'bg-axdoro-surface/60 border border-axdoro-border/60 shadow-subtle'
          : 'bg-transparent'
      } ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-4 border-b border-axdoro-border/60 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-axdoro-accent text-xs uppercase tracking-widest font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{badgeText}</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-serif text-axdoro-text tracking-tight font-normal">
            {collection.title}
          </h2>
          {collection.description && (
            <p className="text-xs md:text-sm text-axdoro-text-muted max-w-2xl font-light">
              {collection.description}
            </p>
          )}
        </div>

        {onNavigateCategory && (
          <button
            type="button"
            onClick={() => onNavigateCategory('all')}
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-axdoro-text hover:text-axdoro-accent transition-colors font-medium self-start md:self-end cursor-pointer"
          >
            <span>Explore Catalogue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Product Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {collection.products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onQuickView={onQuickView}
            onAddToCart={onAddToCart}
          />
        ))}
      </div>
    </section>
  );
};

export interface HomepageCollectionsProps {
  collections?: HomepageCollection[];
  slug?: string;
  allowedSlugs?: string[];
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size: string, color: string) => void;
  onNavigateCategory?: (categorySlug: string) => void;
}

/**
 * Wrapper component maintaining backward compatibility for multi-collection renders
 * or filtered collection renders.
 */
export const HomepageCollections: React.FC<HomepageCollectionsProps> = ({
  collections: propCollections,
  slug,
  allowedSlugs,
  onQuickView,
  onAddToCart,
  onNavigateCategory,
}) => {
  // If a single slug is requested, delegate to HomepageCollectionSection
  if (slug) {
    return (
      <HomepageCollectionSection
        slug={slug}
        onQuickView={onQuickView}
        onAddToCart={onAddToCart}
        onNavigateCategory={onNavigateCategory}
      />
    );
  }

  const [collections, setCollections] = useState<HomepageCollection[]>(propCollections || []);
  const [isLoading, setIsLoading] = useState<boolean>(!propCollections);

  useEffect(() => {
    if (propCollections) {
      setCollections(propCollections);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    fetchHomepageCollections()
      .then((data) => {
        if (isMounted) {
          setCollections(data);
        }
      })
      .catch((err) => {
        console.warn('[HomepageCollections] Failed to load collections:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [propCollections]);

  // Filter only collections with eligible products, matching allowedSlugs if provided
  const visibleCollections = collections.filter((col) => {
    const hasProducts = Array.isArray(col.products) && col.products.length > 0;
    if (!hasProducts) return false;
    if (Array.isArray(allowedSlugs) && allowedSlugs.length > 0) {
      return allowedSlugs.includes(col.slug);
    }
    return true;
  });

  if (isLoading || visibleCollections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-12 my-8">
      {visibleCollections.map((collection, index) => (
        <HomepageCollectionSection
          key={collection.id}
          collection={collection}
          variant={index % 2 === 1 ? 'alternate' : 'default'}
          badgeText={collection.slug === 'best-sellers' ? 'Top Sellers' : 'Curated Selection'}
          onQuickView={onQuickView}
          onAddToCart={onAddToCart}
          onNavigateCategory={onNavigateCategory}
        />
      ))}
    </div>
  );
};
