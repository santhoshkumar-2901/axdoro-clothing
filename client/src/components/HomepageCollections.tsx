import React, { useState, useEffect } from 'react';
import { Product, HomepageCollection } from '../types/product.ts';
import { ProductCard } from './ProductCard.tsx';
import { fetchHomepageCollections } from '../api/catalogue.ts';
import { Sparkles, ArrowRight } from 'lucide-react';

interface HomepageCollectionsProps {
  collections?: HomepageCollection[];
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size: string, color: string) => void;
  onNavigateCategory?: (categorySlug: string) => void;
}

export const HomepageCollections: React.FC<HomepageCollectionsProps> = ({
  collections: propCollections,
  onQuickView,
  onAddToCart,
  onNavigateCategory,
}) => {
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

  // Filter only collections with eligible products
  const visibleCollections = collections.filter(
    (col) => Array.isArray(col.products) && col.products.length > 0
  );

  if (isLoading || visibleCollections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-20 my-16">
      {visibleCollections.map((collection, index) => {
        const isAlternate = index % 2 === 1;
        return (
          <section
            key={collection.id}
            id={`collection-${collection.slug}`}
            className={`py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto rounded-2xl transition-all duration-300 ${
              isAlternate ? 'bg-[#FAF8F5]/80 border border-axdoro-border/40' : 'bg-transparent'
            }`}
          >
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-4 border-b border-axdoro-border/60 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-axdoro-purple text-xs uppercase tracking-widest font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Curated Selection</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-serif text-axdoro-text tracking-tight font-normal">
                  {collection.title}
                </h2>
                {collection.description && (
                  <p className="text-xs md:text-sm text-axdoro-muted max-w-2xl font-light">
                    {collection.description}
                  </p>
                )}
              </div>

              {onNavigateCategory && (
                <button
                  type="button"
                  onClick={() => onNavigateCategory('all')}
                  className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-axdoro-text hover:text-axdoro-purple transition-colors font-medium self-start md:self-end"
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
      })}
    </div>
  );
};
