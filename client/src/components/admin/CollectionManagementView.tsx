import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Save,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Search,
  ShoppingBag,
} from 'lucide-react';
import {
  adminGetHomepageCollections,
  adminUpdateHomepageCollection,
  adminUpdateCollectionProducts,
  adminGetProducts,
  AdminProduct,
} from '../../api/admin.ts';
import { useScrollLock } from '../../utils/scrollLock.ts';
import {
  AdminHomepageCollection,
  formatPaiseToINR,
} from '../../types/product.ts';
import { Button } from '../ui/button.tsx';
import { Input, Label } from '../ui/input.tsx';
import { Badge } from '../ui/badge.tsx';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../ui/card.tsx';

interface CollectionManagementViewProps {
  onCollectionMutated?: () => void;
}

export const CollectionManagementView: React.FC<CollectionManagementViewProps> = ({
  onCollectionMutated,
}) => {
  const [collections, setCollections] = useState<AdminHomepageCollection[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>('best-sellers');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state for active collection
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isEnabled, setIsEnabled] = useState<boolean>(true);

  // Add products modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [catalogProducts, setCatalogProducts] = useState<AdminProduct[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Global reference-counted scroll lock while add products modal is open
  useScrollLock(isAddModalOpen);

  const loadCollections = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminGetHomepageCollections();
      setCollections(data);

      const current = data.find((c) => c.slug === activeSlug) || data[0];
      if (current) {
        setActiveSlug(current.slug);
        setTitle(current.title);
        setDescription(current.description || '');
        setIsEnabled(current.isEnabled);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collections');
    } finally {
      setIsLoading(false);
    }
  }, [activeSlug]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  // Sync form inputs when active slug changes
  const handleSelectCollection = (col: AdminHomepageCollection) => {
    setActiveSlug(col.slug);
    setTitle(col.title);
    setDescription(col.description || '');
    setIsEnabled(col.isEnabled);
    setError(null);
    setSuccessMessage(null);
  };

  const activeCollection = collections.find((c) => c.slug === activeSlug);

  // Save metadata (title, description, isEnabled)
  const handleSaveMetadata = async () => {
    if (!activeCollection) return;
    if (!title.trim()) {
      setError('Section title cannot be empty');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      const updated = await adminUpdateHomepageCollection(activeCollection.id, {
        title: title.trim(),
        description: description.trim() || null,
        isEnabled,
      });

      setCollections((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      setSuccessMessage(`Saved settings for "${updated.title}" successfully.`);
      if (onCollectionMutated) onCollectionMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save collection');
    } finally {
      setIsSaving(false);
    }
  };

  // Reorder products (move up or move down)
  const handleMoveProduct = async (index: number, direction: 'up' | 'down') => {
    if (!activeCollection) return;
    const currentProducts = [...activeCollection.products];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= currentProducts.length) return;

    // Swap items
    const [moved] = currentProducts.splice(index, 1);
    currentProducts.splice(targetIndex, 0, moved);

    const productIds = currentProducts.map((p) => p.id);

    try {
      setIsSaving(true);
      setError(null);
      const updated = await adminUpdateCollectionProducts(activeCollection.id, productIds);
      setCollections((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      if (onCollectionMutated) onCollectionMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder products');
    } finally {
      setIsSaving(false);
    }
  };

  // Remove a product from the collection
  const handleRemoveProduct = async (productId: string) => {
    if (!activeCollection) return;
    const updatedIds = activeCollection.products
      .filter((p) => p.id !== productId)
      .map((p) => p.id);

    try {
      setIsSaving(true);
      setError(null);
      const updated = await adminUpdateCollectionProducts(activeCollection.id, updatedIds);
      setCollections((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      setSuccessMessage('Product removed from collection.');
      if (onCollectionMutated) onCollectionMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove product');
    } finally {
      setIsSaving(false);
    }
  };

  // Open "Add Products" modal & load catalog
  const handleOpenAddModal = async () => {
    setIsAddModalOpen(true);
    setSearchQuery('');
    try {
      setIsLoadingCatalog(true);
      const res = await adminGetProducts('published');
      setCatalogProducts(res || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog products');
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  // Add product to active collection
  const handleAddProduct = async (product: AdminProduct) => {
    if (!activeCollection) return;
    if (activeCollection.products.some((p) => p.id === product.id)) return;

    const currentIds = activeCollection.products.map((p) => p.id);
    const updatedIds = [...currentIds, product.id];

    try {
      setIsSaving(true);
      setError(null);
      const updated = await adminUpdateCollectionProducts(activeCollection.id, updatedIds);
      setCollections((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      setSuccessMessage(`Added "${product.name}" to ${activeCollection.title}.`);
      if (onCollectionMutated) onCollectionMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add product to collection');
    } finally {
      setIsSaving(false);
    }
  };

  // Available catalog products not yet in active collection
  const availableProducts = catalogProducts
    .filter((p) => !activeCollection?.products.some((existing) => existing.id === p.id))
    .filter((p) =>
      searchQuery.trim() === ''
        ? true
        : p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
    );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-axdoro-purple" />
        <p className="text-sm text-axdoro-muted">Loading homepage collections...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-axdoro-border">
        <div>
          <h2 className="text-xl font-serif text-axdoro-text flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-axdoro-purple" />
            Homepage Collections
          </h2>
          <p className="text-xs text-axdoro-muted mt-1">
            Curate and reorder products displayed in featured sections on the storefront homepage.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Error: </span>
            {error}
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
          <div className="flex-1 font-medium">{successMessage}</div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Collection Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-axdoro-border pb-2">
        {collections.map((col) => {
          const isActive = col.slug === activeSlug;
          return (
            <button
              key={col.id}
              onClick={() => handleSelectCollection(col)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors flex items-center gap-2 border-b-2 ${
                isActive
                  ? 'border-axdoro-purple text-axdoro-purple bg-purple-50/50'
                  : 'border-transparent text-axdoro-muted hover:text-axdoro-text'
              }`}
            >
              <span>{col.title}</span>
              <Badge variant={col.isEnabled ? 'outline' : 'secondary'} className="text-[10px] px-1.5 py-0">
                {col.products.length} {col.products.length === 1 ? 'item' : 'items'}
              </Badge>
              {!col.isEnabled && (
                <Badge variant="secondary" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                  Disabled
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {activeCollection && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Collection Settings */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="border-axdoro-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium text-axdoro-text">
                  Section Settings
                </CardTitle>
                <CardDescription className="text-xs text-axdoro-muted">
                  Configure storefront display title and visibility for this collection.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="collection-slug" className="text-xs text-axdoro-text-muted">
                    Collection Identifier
                  </Label>
                  <Input
                    id="collection-slug"
                    value={activeCollection.slug}
                    disabled
                    className="mt-1 font-mono text-xs bg-axdoro-surface-muted text-axdoro-text-muted"
                  />
                  <span className="text-[10px] text-axdoro-text-muted mt-0.5 block">
                    Fixed system key: {activeCollection.slug}
                  </span>
                </div>

                <div>
                  <Label htmlFor="collection-title" className="text-xs font-medium text-axdoro-text">
                    Display Title *
                  </Label>
                  <Input
                    id="collection-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. This Month's Best Sellers"
                    className="mt-1 text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="collection-description" className="text-xs font-medium text-axdoro-text">
                    Subtitle / Description
                  </Label>
                  <textarea
                    id="collection-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Optional curation subtitle for the storefront..."
                    className="mt-1 w-full rounded-md border border-axdoro-border bg-axdoro-surface px-3 py-2 text-xs text-axdoro-text placeholder:text-axdoro-text-muted/60 focus:outline-none focus:ring-1 focus:ring-axdoro-accent"
                  />
                </div>

                {/* Enable / Disable Toggle */}
                <div className="pt-2 border-t border-axdoro-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-axdoro-text block">
                        Storefront Visibility
                      </span>
                      <span className="text-[11px] text-axdoro-text-muted">
                        {isEnabled
                          ? 'Enabled (Shown when containing published products)'
                          : 'Disabled (Hidden on storefront)'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEnabled(!isEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        isEnabled ? 'bg-axdoro-purple' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleSaveMetadata}
                    disabled={isSaving}
                    className="w-full bg-axdoro-charcoal hover:bg-black text-white text-xs h-9 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Save Section Settings
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="p-3 bg-warm-ivory/50 rounded-md border border-axdoro-border/60 text-[11px] text-axdoro-muted space-y-1">
              <span className="font-semibold text-axdoro-text block">Display Rules:</span>
              <p>• Only published products with active categories are displayed on the storefront.</p>
              <p>• If a section has 0 eligible products or is disabled, it is completely hidden from the homepage.</p>
              <p>• Product selections and orderings are strictly independent between sections.</p>
            </div>
          </div>

          {/* Right Column: Collection Products List & Ordering */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-axdoro-border">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium text-axdoro-text flex items-center gap-2">
                    Curated Products
                    <Badge variant="outline" className="text-xs">
                      {activeCollection.products.length}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-axdoro-muted">
                    Order items using the arrows. Items appear in this exact order on the storefront.
                  </CardDescription>
                </div>
                <Button
                  onClick={handleOpenAddModal}
                  size="sm"
                  className="bg-axdoro-purple hover:bg-purple-700 text-white text-xs h-8 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Products
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {activeCollection.products.length === 0 ? (
                  <div className="text-center py-12 px-4 space-y-3">
                    <ShoppingBag className="w-10 h-10 text-axdoro-border-strong mx-auto" />
                    <p className="text-sm font-medium text-axdoro-text">No products in this collection</p>
                    <p className="text-xs text-axdoro-text-muted max-w-sm mx-auto">
                      Click "Add Products" to curate items for this section. Empty sections will not appear on the storefront.
                    </p>
                    <Button
                      onClick={handleOpenAddModal}
                      variant="outline"
                      size="sm"
                      className="text-xs mt-2"
                    >
                      Browse Catalogue
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-axdoro-border">
                    {activeCollection.products.map((prod, index) => (
                      <div
                        key={prod.id}
                        className="p-3.5 flex items-center justify-between gap-4 hover:bg-axdoro-surface-muted/50 transition-colors"
                      >
                        {/* Order & Thumbnail */}
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-5 text-center text-xs font-semibold text-axdoro-text-muted">
                            {index + 1}
                          </span>
                          <div className="w-12 h-12 rounded bg-axdoro-surface-muted border border-axdoro-border overflow-hidden flex-shrink-0 flex items-center justify-center">
                            {prod.imageUrl ? (
                              <img
                                src={prod.imageUrl}
                                alt={prod.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ShoppingBag className="w-5 h-5 text-axdoro-border-strong" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-axdoro-text truncate block">
                              {prod.name}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-axdoro-muted mt-0.5">
                              <span className="capitalize">{prod.categoryName}</span>
                              <span>•</span>
                              <span>{formatPaiseToINR(prod.minPricePaise)}</span>
                              <span>•</span>
                              <Badge
                                variant={prod.status === 'published' ? 'outline' : 'secondary'}
                                className={`text-[9px] px-1 py-0 ${
                                  prod.status === 'published'
                                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                    : 'text-amber-700 bg-amber-50'
                                }`}
                              >
                                {prod.status}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Reorder and Remove Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveProduct(index, 'up')}
                            disabled={index === 0 || isSaving}
                            title="Move Up"
                            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent text-axdoro-muted hover:text-axdoro-text transition-colors"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveProduct(index, 'down')}
                            disabled={index === activeCollection.products.length - 1 || isSaving}
                            title="Move Down"
                            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent text-axdoro-muted hover:text-axdoro-text transition-colors"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(prod.id)}
                            disabled={isSaving}
                            title="Remove from collection"
                            className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors ml-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Add Products Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-axdoro-surface rounded-lg shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col border border-axdoro-border">
            {/* Modal Header */}
            <div className="p-4 border-b border-axdoro-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-serif text-axdoro-text">
                  Add Products to {activeCollection?.title}
                </h3>
                <p className="text-xs text-axdoro-text-muted mt-0.5">
                  Select published products to add to this section.
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-axdoro-text-muted hover:text-axdoro-text p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-axdoro-border bg-axdoro-surface-muted/50">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-axdoro-text-muted" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by product name or category..."
                  className="pl-9 text-xs h-9"
                />
              </div>
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isLoadingCatalog ? (
                <div className="py-12 text-center space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-axdoro-accent mx-auto" />
                  <p className="text-xs text-axdoro-text-muted">Loading catalogue products...</p>
                </div>
              ) : availableProducts.length === 0 ? (
                <div className="py-12 text-center text-xs text-axdoro-text-muted">
                  {catalogProducts.length === 0
                    ? 'No published products found in catalogue.'
                    : 'All matching published products are already in this collection.'}
                </div>
              ) : (
                availableProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className="p-3 rounded-md border border-axdoro-border flex items-center justify-between gap-3 hover:bg-axdoro-surface-muted/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded bg-axdoro-surface-muted border border-axdoro-border overflow-hidden flex-shrink-0 flex items-center justify-center">
                        <ShoppingBag className="w-4 h-4 text-axdoro-border-strong" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-axdoro-text truncate block">
                          {prod.name}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-axdoro-text-muted mt-0.5">
                          <span>{prod.categoryName}</span>
                          <span>•</span>
                          <span>{formatPaiseToINR(prod.minPricePaise)}</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAddProduct(prod)}
                      disabled={isSaving}
                      className="h-7 text-xs bg-axdoro-charcoal text-white px-3"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-axdoro-border flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddModalOpen(false)}
                className="text-xs h-8"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
