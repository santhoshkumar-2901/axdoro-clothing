import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '../ui/button.tsx';
import { Input, Label } from '../ui/input.tsx';
import { Badge } from '../ui/badge.tsx';
import {
  AdminCategory,
  ProductImage,
  adminGetCategories,
  adminGetProductDetails,
  adminUpdateProduct,
  adminCreateVariant,
  adminUpdateVariant,
  UpdateProductPayload,
  CreateProductVariantPayload,
  UpdateProductVariantPayload,
} from '../../api/admin.ts';
import { ProductImageModal } from './ProductImageModal.tsx';
import { useScrollLock } from '../../utils/scrollLock.ts';

interface ProductEditDialogProps {
  productId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface VariantEditItem {
  id: string; // Database UUID or temporary ID for new variant
  isNew: boolean;
  size: string;
  color: string;
  colorHex: string;
  sku: string;
  priceRupees: string;
  comparisonPriceRupees: string;
  stockQuantity: string;
  isActive: boolean;
  // Snapshot of original database values to detect modifications
  original?: {
    size: string;
    color: string;
    colorHex: string;
    sku: string;
    priceRupees: string;
    comparisonPriceRupees: string;
    stockQuantity: string;
    isActive: boolean;
  };
}

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

const FABRIC_PRESETS = [
  '100% French Terry Cotton, 240 GSM',
  '100% Combed Compact Cotton, 220 GSM',
  '100% Giza Cotton Poplin, 160 GSM',
  '100% Heavyweight Cotton, 280 GSM',
  'Supima Cotton Slub, 190 GSM',
];

export const ProductEditDialog: React.FC<ProductEditDialogProps> = ({
  productId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  // Global reference-counted scroll lock while product editing dialog is open
  useScrollLock(isOpen && Boolean(productId));

  // Categories and loading state
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Basic Information
  const [name, setName] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('published');
  const [isFeatured, setIsFeatured] = useState<boolean>(false);
  const [isNewArrival, setIsNewArrival] = useState<boolean>(false);
  const [fabricSpec, setFabricSpec] = useState<string>('');

  // Variants state
  const [variants, setVariants] = useState<VariantEditItem[]>([]);

  // Existing images state
  const [images, setImages] = useState<ProductImage[]>([]);
  const [isImageModalOpen, setIsImageModalOpen] = useState<boolean>(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load product data and categories when dialog opens
  const loadProductData = useCallback(async (id: string) => {
    setIsLoading(true);
    setLoadError(null);
    setFormError(null);

    try {
      const [cats, prod] = await Promise.all([
        adminGetCategories(),
        adminGetProductDetails(id),
      ]);

      setCategories(cats);
      setName(prod.name || '');
      setSlug(prod.slug || '');
      setDescription(prod.description || '');
      setCategoryId(prod.categoryId || '');
      setStatus((prod.status as 'draft' | 'published' | 'archived') || 'published');
      setIsFeatured(Boolean(prod.isFeatured));
      setIsNewArrival(Boolean(prod.isNewArrival));
      setFabricSpec(prod.fabricSpec || '');
      setImages(prod.images || []);

      const mappedVariants: VariantEditItem[] = (prod.variants || []).map((v) => {
        const pRup = (v.pricePaise / 100).toString();
        const cpRup = v.comparisonPricePaise != null ? (v.comparisonPricePaise / 100).toString() : '';
        const sQty = v.stockQuantity.toString();
        const cHex = v.colorHex || '#000000';

        return {
          id: v.id,
          isNew: false,
          size: v.size,
          color: v.color,
          colorHex: cHex,
          sku: v.sku,
          priceRupees: pRup,
          comparisonPriceRupees: cpRup,
          stockQuantity: sQty,
          isActive: v.isActive,
          original: {
            size: v.size,
            color: v.color,
            colorHex: cHex,
            sku: v.sku,
            priceRupees: pRup,
            comparisonPriceRupees: cpRup,
            stockQuantity: sQty,
            isActive: v.isActive,
          },
        };
      });

      setVariants(mappedVariants);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(`Failed to load product details: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && productId) {
      loadProductData(productId);
    }
  }, [isOpen, productId, loadProductData]);

  if (!isOpen || !productId) return null;

  // Add new variant
  const handleAddVariant = () => {
    const tempId = `new_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const baseSlug = (slug || 'PROD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const generatedSku = `AX-${baseSlug}-M-BLK-${Date.now().toString().slice(-4)}`;

    const newVar: VariantEditItem = {
      id: tempId,
      isNew: true,
      size: 'M',
      color: 'Midnight Black',
      colorHex: '#0f172a',
      sku: generatedSku,
      priceRupees: variants[0]?.priceRupees || '999',
      comparisonPriceRupees: variants[0]?.comparisonPriceRupees || '',
      stockQuantity: '10',
      isActive: true,
    };

    setVariants([...variants, newVar]);
  };

  // Remove newly added variant
  const handleRemoveNewVariant = (id: string) => {
    setVariants(variants.filter((v) => v.id !== id));
  };

  // Toggle active status for existing variant
  const handleToggleVariantActive = (id: string) => {
    setVariants(
      variants.map((v) => (v.id === id ? { ...v, isActive: !v.isActive } : v))
    );
  };

  // Update variant field
  const handleUpdateVariant = (
    id: string,
    field: keyof Omit<VariantEditItem, 'id' | 'isNew' | 'original'>,
    value: any
  ) => {
    setVariants(
      variants.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // 1. Validate Basic Info
    const cleanName = name.trim();
    if (cleanName.length < 3) {
      setFormError('Product name must be at least 3 characters long.');
      return;
    }

    const cleanSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cleanSlug)) {
      setFormError('Slug must contain only lower-case alphanumeric characters and hyphens.');
      return;
    }

    if (!categoryId) {
      setFormError('Please select a valid product category.');
      return;
    }

    // 2. Validate Variants
    if (variants.length === 0) {
      setFormError('Every product must maintain at least one variant.');
      return;
    }

    // Check duplicate SKUs
    const skus = new Set<string>();
    const combos = new Set<string>();

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const cleanSku = v.sku.trim().toUpperCase();

      if (!cleanSku) {
        setFormError(`Variant #${i + 1} requires a valid SKU code.`);
        return;
      }

      if (skus.has(cleanSku)) {
        setFormError(`Duplicate SKU "${cleanSku}" detected across variants.`);
        return;
      }
      skus.add(cleanSku);

      const comboKey = `${v.size.trim().toUpperCase()}_${v.color.trim().toLowerCase()}`;
      if (combos.has(comboKey)) {
        setFormError(`Duplicate variant combination: Size "${v.size}" in Color "${v.color}".`);
        return;
      }
      combos.add(comboKey);

      // Validate prices in rupees -> integer paise
      const priceNum = parseFloat(v.priceRupees);
      if (isNaN(priceNum) || priceNum < 0) {
        setFormError(`Variant #${i + 1} (${v.sku}) has an invalid selling price.`);
        return;
      }

      if (v.comparisonPriceRupees && v.comparisonPriceRupees.trim()) {
        const compNum = parseFloat(v.comparisonPriceRupees);
        if (isNaN(compNum) || compNum < 0) {
          setFormError(`Variant #${i + 1} (${v.sku}) has an invalid comparison price.`);
          return;
        }
        if (compNum < priceNum) {
          setFormError(`Variant #${i + 1} (${v.sku}): Comparison price (₹${compNum}) cannot be lower than selling price (₹${priceNum}).`);
          return;
        }
      }

      const stockNum = parseInt(v.stockQuantity, 10);
      if (isNaN(stockNum) || stockNum < 0) {
        setFormError(`Variant #${i + 1} (${v.sku}) has an invalid stock quantity.`);
        return;
      }
    }

    // 3. Execute updates
    setIsSubmitting(true);
    try {
      // Step A: Update basic product metadata
      const productPayload: UpdateProductPayload = {
        name: cleanName,
        slug: cleanSlug,
        description: description.trim(),
        categoryId,
        status,
        isFeatured,
        isNewArrival,
        fabricSpec: fabricSpec.trim() ? fabricSpec.trim() : null,
      };

      await adminUpdateProduct(productId, productPayload);

      // Step B: Reconcile variants (updates and creations)
      for (const v of variants) {
        const pricePaise = Math.round(parseFloat(v.priceRupees) * 100);
        const comparisonPricePaise =
          v.comparisonPriceRupees && v.comparisonPriceRupees.trim()
            ? Math.round(parseFloat(v.comparisonPriceRupees) * 100)
            : null;
        const stockQuantity = parseInt(v.stockQuantity, 10);

        if (v.isNew) {
          // Create new variant
          const newVariantPayload: CreateProductVariantPayload = {
            size: v.size.trim(),
            color: v.color.trim(),
            colorHex: v.colorHex.trim() || undefined,
            sku: v.sku.trim().toUpperCase(),
            pricePaise,
            comparisonPricePaise,
            stockQuantity,
            isActive: v.isActive,
          };
          await adminCreateVariant(productId, newVariantPayload);
        } else {
          // Check if existing variant was modified compared to original snapshot
          const orig = v.original;
          const isModified =
            !orig ||
            orig.size !== v.size ||
            orig.color !== v.color ||
            orig.colorHex !== v.colorHex ||
            orig.sku !== v.sku ||
            orig.priceRupees !== v.priceRupees ||
            orig.comparisonPriceRupees !== v.comparisonPriceRupees ||
            orig.stockQuantity !== v.stockQuantity ||
            orig.isActive !== v.isActive;

          if (isModified) {
            const updatePayload: UpdateProductVariantPayload = {
              size: v.size.trim(),
              color: v.color.trim(),
              colorHex: v.colorHex.trim() || undefined,
              sku: v.sku.trim().toUpperCase(),
              pricePaise,
              comparisonPricePaise,
              stockQuantity,
              isActive: v.isActive,
            };
            await adminUpdateVariant(productId, v.id, updatePayload);
          }
        }
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overscroll-contain animate-in fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-product-dialog-title"
      >
        <div className="bg-axdoro-surface border border-axdoro-border rounded-2xl shadow-elevated w-full max-w-4xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col my-auto overflow-hidden text-axdoro-charcoal">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-axdoro-border bg-axdoro-surface shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-axdoro-accent/10 border border-axdoro-accent/20 flex items-center justify-center text-axdoro-accent">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="edit-product-dialog-title" className="text-lg font-bold text-axdoro-charcoal tracking-tight">
                    Edit Product
                  </h2>
                  <Badge variant={status === 'published' ? 'default' : 'secondary'} className="text-[11px] font-mono">
                    {status}
                  </Badge>
                </div>
                <p className="text-xs text-axdoro-text-muted">
                  Update product metadata, variants, pricing, and live inventory.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-axdoro-text-muted hover:text-axdoro-charcoal p-1.5 rounded-lg hover:bg-axdoro-bg transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Content / Loading View */}
          {isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-axdoro-accent animate-spin" />
              <p className="text-sm font-medium text-axdoro-text-muted">Loading product details from database...</p>
            </div>
          ) : loadError ? (
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-900 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-red-950">Unable to Load Product</h4>
                  <p className="mt-1">{loadError}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
              {/* Error banner */}
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-900 flex items-start gap-2.5 animate-in slide-in-from-top-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold">Error Updating Product:</span>
                    <p>{formError}</p>
                  </div>
                </div>
              )}

              {/* Section 1: Basic Information */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1.5 border-b border-axdoro-border">
                  <span className="text-xs font-bold uppercase tracking-wider text-axdoro-text-muted">
                    1. Product Information
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Product Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-prod-name" className="text-xs font-semibold">
                      Product Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="edit-prod-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Luxury Heavyweight Oversized Tee"
                    />
                  </div>

                  {/* Slug */}
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-prod-slug" className="text-xs font-semibold">
                      URL Slug <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="edit-prod-slug"
                      required
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase())}
                      placeholder="e.g. luxury-heavyweight-oversized-tee"
                      className="font-mono text-xs"
                    />
                  </div>

                  {/* Category */}
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-prod-category" className="text-xs font-semibold">
                      Category <span className="text-red-500">*</span>
                    </Label>
                    <select
                      id="edit-prod-category"
                      required
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full h-10 px-3 py-2 text-xs rounded-lg border border-axdoro-border bg-axdoro-surface text-axdoro-charcoal focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                    >
                      <option value="" disabled>
                        Select a category...
                      </option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Status */}
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-prod-status" className="text-xs font-semibold">
                      Publication Status <span className="text-red-500">*</span>
                    </Label>
                    <select
                      id="edit-prod-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as 'draft' | 'published' | 'archived')}
                      className="w-full h-10 px-3 py-2 text-xs rounded-lg border border-axdoro-border bg-axdoro-surface text-axdoro-charcoal focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                    >
                      <option value="published">Published (Visible on Storefront)</option>
                      <option value="draft">Draft (Hidden from Storefront)</option>
                      <option value="archived">Archived (Delisted from Storefront)</option>
                    </select>
                  </div>
                </div>

                {/* Fabric Specification */}
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="edit-prod-fabric" className="text-xs font-semibold flex items-center justify-between">
                    <span>Fabric Specification (Optional)</span>
                    <span className="text-[11px] text-axdoro-text-muted font-normal">Displayed on luxury product badges</span>
                  </Label>
                  <Input
                    id="edit-prod-fabric"
                    value={fabricSpec}
                    onChange={(e) => setFabricSpec(e.target.value)}
                    placeholder="e.g. 100% French Terry Cotton, 240 GSM"
                  />
                  {/* Preset chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {FABRIC_PRESETS.map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setFabricSpec(p)}
                        className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                          fabricSpec === p
                            ? 'bg-axdoro-accent text-white border-axdoro-accent'
                            : 'bg-axdoro-bg text-axdoro-text-muted border-axdoro-border hover:border-axdoro-charcoal'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-prod-desc" className="text-xs font-semibold">
                    Product Description
                  </Label>
                  <textarea
                    id="edit-prod-desc"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Detailed craftsmanship and luxury design notes..."
                    className="w-full p-3 text-xs rounded-lg border border-axdoro-border bg-axdoro-surface text-axdoro-charcoal focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                  />
                </div>

                {/* Featured / New Arrival flags */}
                <div className="flex flex-wrap items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-axdoro-charcoal">
                    <input
                      type="checkbox"
                      checked={isFeatured}
                      onChange={(e) => setIsFeatured(e.target.checked)}
                      className="rounded border-axdoro-border text-axdoro-accent focus:ring-axdoro-accent w-4 h-4 cursor-pointer"
                    />
                    <span>Feature on Homepage Showcase</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-axdoro-charcoal">
                    <input
                      type="checkbox"
                      checked={isNewArrival}
                      onChange={(e) => setIsNewArrival(e.target.checked)}
                      className="rounded border-axdoro-border text-axdoro-accent focus:ring-axdoro-accent w-4 h-4 cursor-pointer"
                    />
                    <span>Mark as New Arrival</span>
                  </label>
                </div>
              </div>

              {/* Section 2: Product Variants */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-axdoro-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-axdoro-text-muted">
                      2. Product Variants & Inventory
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {variants.length} {variants.length === 1 ? 'variant' : 'variants'}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddVariant}
                    className="h-8 text-xs gap-1 border-dashed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Variant
                  </Button>
                </div>

                <div className="space-y-3">
                  {variants.map((v, idx) => {
                    const priceVal = parseFloat(v.priceRupees) || 0;
                    const compVal = parseFloat(v.comparisonPriceRupees) || 0;
                    const discountPercent =
                      compVal > priceVal && compVal > 0
                        ? Math.round(((compVal - priceVal) / compVal) * 100)
                        : 0;

                    return (
                      <div
                        key={v.id}
                        className={`p-4 rounded-xl border transition-all ${
                          !v.isActive
                            ? 'bg-axdoro-bg/40 border-dashed border-axdoro-border opacity-75'
                            : v.isNew
                            ? 'bg-blue-50/40 border-blue-200'
                            : 'bg-axdoro-surface border-axdoro-border'
                        }`}
                      >
                        <div className="flex items-center justify-between pb-2 mb-3 border-b border-axdoro-border/60">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-axdoro-charcoal">
                              Variant #{idx + 1}
                            </span>
                            {v.isNew ? (
                              <Badge className="bg-blue-600 text-[10px]">New</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-mono text-axdoro-text-muted">
                                Saved
                              </Badge>
                            )}
                            {!v.isActive && (
                              <Badge variant="destructive" className="text-[10px]">
                                Deactivated / Inactive
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Active Toggle */}
                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-axdoro-text-muted cursor-pointer mr-2">
                              <input
                                type="checkbox"
                                checked={v.isActive}
                                onChange={() => handleToggleVariantActive(v.id)}
                                className="rounded border-axdoro-border text-axdoro-accent focus:ring-axdoro-accent w-3.5 h-3.5"
                              />
                              <span>Active</span>
                            </label>

                            {/* Remove button: only available for newly added variants */}
                            {v.isNew ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveNewVariant(v.id)}
                                className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50 text-xs flex items-center gap-1"
                                title="Remove new variant"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove</span>
                              </button>
                            ) : (
                              <span
                                className="text-[10px] text-axdoro-text-muted italic"
                                title="Saved variants cannot be deleted directly to protect historical order items. Uncheck Active to deactivate."
                              >
                                Uncheck Active to delist
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Variant input fields */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                          {/* Size */}
                          <div className="space-y-1">
                            <Label className="text-[11px] font-medium text-axdoro-text-muted">Size</Label>
                            <select
                              value={v.size}
                              onChange={(e) => handleUpdateVariant(v.id, 'size', e.target.value)}
                              className="w-full h-9 px-2 text-xs rounded-md border border-axdoro-border bg-axdoro-surface text-axdoro-charcoal"
                            >
                              {SIZE_OPTIONS.map((sz) => (
                                <option key={sz} value={sz}>
                                  {sz}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Color */}
                          <div className="space-y-1">
                            <Label className="text-[11px] font-medium text-axdoro-text-muted">Color</Label>
                            <Input
                              value={v.color}
                              onChange={(e) => handleUpdateVariant(v.id, 'color', e.target.value)}
                              className="h-9 text-xs"
                              placeholder="e.g. Black"
                            />
                          </div>

                          {/* Color Hex */}
                          <div className="space-y-1">
                            <Label className="text-[11px] font-medium text-axdoro-text-muted">Color Swatch</Label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={v.colorHex || '#000000'}
                                onChange={(e) => handleUpdateVariant(v.id, 'colorHex', e.target.value)}
                                className="w-8 h-9 p-0.5 rounded border border-axdoro-border cursor-pointer bg-axdoro-surface"
                              />
                              <Input
                                value={v.colorHex}
                                onChange={(e) => handleUpdateVariant(v.id, 'colorHex', e.target.value)}
                                className="h-9 text-xs font-mono"
                                placeholder="#000000"
                              />
                            </div>
                          </div>

                          {/* SKU */}
                          <div className="space-y-1">
                            <Label className="text-[11px] font-medium text-axdoro-text-muted">SKU Code</Label>
                            <Input
                              value={v.sku}
                              onChange={(e) => handleUpdateVariant(v.id, 'sku', e.target.value.toUpperCase())}
                              className="h-9 text-xs font-mono uppercase"
                              placeholder="AX-SKU"
                            />
                          </div>

                          {/* Price */}
                          <div className="space-y-1">
                            <Label className="text-[11px] font-medium text-axdoro-text-muted">Selling Price (₹)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={v.priceRupees}
                              onChange={(e) => handleUpdateVariant(v.id, 'priceRupees', e.target.value)}
                              className="h-9 text-xs font-mono"
                              placeholder="₹"
                            />
                          </div>

                          {/* Comparison Price / Discount */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px] font-medium text-axdoro-text-muted">Comp. Price (₹)</Label>
                              {discountPercent > 0 && (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded">
                                  {discountPercent}% OFF
                                </span>
                              )}
                            </div>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={v.comparisonPriceRupees}
                              onChange={(e) => handleUpdateVariant(v.id, 'comparisonPriceRupees', e.target.value)}
                              className="h-9 text-xs font-mono"
                              placeholder="₹ (Optional)"
                            />
                          </div>
                        </div>

                        {/* Stock Units input */}
                        <div className="mt-3 pt-2.5 border-t border-axdoro-border/60 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3">
                            <Label htmlFor={`stock-${v.id}`} className="text-xs font-semibold text-axdoro-charcoal">
                              Current Stock Quantity (Units):
                            </Label>
                            <Input
                              id={`stock-${v.id}`}
                              type="number"
                              min="0"
                              value={v.stockQuantity}
                              onChange={(e) => handleUpdateVariant(v.id, 'stockQuantity', e.target.value)}
                              className="h-8 w-28 text-xs font-mono"
                            />
                          </div>
                          <span className="text-[11px] text-axdoro-text-muted">
                            Atomic stock persistence & immutable audit log enabled.
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 3: Product Images (Reusing existing Image Management) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-axdoro-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-axdoro-text-muted">
                      3. Product Images
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {images.length} {images.length === 1 ? 'image' : 'images'}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsImageModalOpen(true)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-axdoro-accent" />
                    Manage Images & Uploads
                  </Button>
                </div>

                {images.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-axdoro-border text-center space-y-2 bg-axdoro-bg/30">
                    <ImageIcon className="w-8 h-8 text-axdoro-text-muted mx-auto" />
                    <p className="text-xs text-axdoro-text-muted">No images currently uploaded for this product.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsImageModalOpen(true)}
                      className="text-xs"
                    >
                      Open Image Manager
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {images.map((img) => (
                      <div
                        key={img.id}
                        className="relative group rounded-lg overflow-hidden border border-axdoro-border bg-axdoro-bg aspect-[3/4]"
                      >
                        <img
                          src={img.imageUrl}
                          alt={img.altText || name}
                          className="w-full h-full object-cover"
                        />
                        {img.isPrimary && (
                          <div className="absolute top-1.5 left-1.5 bg-black/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase">
                            Primary
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </form>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-axdoro-border bg-axdoro-surface-muted/30 shrink-0">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || isLoading}
              className="gap-2 bg-axdoro-charcoal text-white hover:bg-black"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Embedded Product Image Modal (Reusing existing Image Management workflow) */}
      {isImageModalOpen && productId && (
        <ProductImageModal
          productId={productId}
          productName={name}
          onClose={() => {
            setIsImageModalOpen(false);
            // Refresh product details to show newly uploaded or reordered images
            loadProductData(productId);
          }}
          onImagesUpdated={() => {
            loadProductData(productId);
          }}
        />
      )}
    </>
  );
};
