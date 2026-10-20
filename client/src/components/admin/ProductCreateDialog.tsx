import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Layers,
  Image as ImageIcon,
  DollarSign,
  Info,
} from 'lucide-react';
import { Button } from '../ui/button.tsx';
import { Input, Label } from '../ui/input.tsx';
import { Badge } from '../ui/badge.tsx';
import {
  AdminCategory,
  adminGetCategories,
  adminCreateProduct,
  CreateProductPayload,
  CreateProductVariantPayload,
  CreateProductImagePayload,
} from '../../api/admin.ts';

interface ProductCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface VariantFormItem {
  id: string; // local temporary key
  size: string;
  color: string;
  colorHex: string;
  sku: string;
  priceRupees: string;
  comparisonPriceRupees: string;
  stockQuantity: string;
  isActive: boolean;
}

interface ImageFormItem {
  id: string; // local temporary key
  imageUrl: string;
  altText: string;
  isPrimary: boolean;
  color?: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}

function generateVariantSku(baseSlug: string, size: string, color: string): string {
  const cleanSlug = (baseSlug || 'AXDORO')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  const cleanSize = size.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'M';
  const cleanColor = color.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'STD';
  return `AX-${cleanSlug}-${cleanSize}-${cleanColor}`;
}

export const ProductCreateDialog: React.FC<ProductCreateDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  // Categories state
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState<boolean>(true);

  // Basic Information
  const [name, setName] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [isSlugManual, setIsSlugManual] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('published');
  const [isFeatured, setIsFeatured] = useState<boolean>(false);
  const [isNewArrival, setIsNewArrival] = useState<boolean>(true);
  const [fabricSpec, setFabricSpec] = useState<string>('');

  // Variants state (at least 1 required)
  const [variants, setVariants] = useState<VariantFormItem[]>([
    {
      id: 'v_1',
      size: 'M',
      color: 'Pitch Black',
      colorHex: '#0f0f14',
      sku: 'AX-TEE-M-PBLK',
      priceRupees: '699',
      comparisonPriceRupees: '899',
      stockQuantity: '25',
      isActive: true,
    },
  ]);

  // Images state (optional direct URLs on create)
  const [images, setImages] = useState<ImageFormItem[]>([]);

  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load active categories on dialog open
  useEffect(() => {
    if (isOpen) {
      setIsLoadingCategories(true);
      adminGetCategories()
        .then((cats) => {
          setCategories(cats);
          if (cats.length > 0 && !categoryId) {
            setCategoryId(cats[0].id);
          }
        })
        .catch((err) => {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to load categories');
        })
        .finally(() => {
          setIsLoadingCategories(false);
        });
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // Auto-slugify when name changes if user hasn't typed custom slug
  const handleNameChange = (val: string) => {
    setName(val);
    if (!isSlugManual) {
      const generated = slugify(val);
      setSlug(generated);
      // update SKUs for variants that are default
      setVariants((prev) =>
        prev.map((v) => ({
          ...v,
          sku: generateVariantSku(generated, v.size, v.color),
        }))
      );
    }
  };

  // Add new variant row
  const handleAddVariant = () => {
    const nextIndex = variants.length + 1;
    const defaultSizes = ['S', 'M', 'L', 'XL', 'XXL'];
    const nextSize = defaultSizes[variants.length % defaultSizes.length];
    const currentColor = variants[0]?.color || 'Pitch Black';
    const currentColorHex = variants[0]?.colorHex || '#0f0f14';
    const currentPrice = variants[0]?.priceRupees || '699';
    const currentCompPrice = variants[0]?.comparisonPriceRupees || '899';

    const newVariant: VariantFormItem = {
      id: `v_${Date.now()}_${nextIndex}`,
      size: nextSize,
      color: currentColor,
      colorHex: currentColorHex,
      sku: generateVariantSku(slug, nextSize, currentColor),
      priceRupees: currentPrice,
      comparisonPriceRupees: currentCompPrice,
      stockQuantity: '20',
      isActive: true,
    };
    setVariants((prev) => [...prev, newVariant]);
  };

  // Remove variant row
  const handleRemoveVariant = (id: string) => {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  // Update specific variant field
  const handleUpdateVariant = (id: string, field: keyof VariantFormItem, val: any) => {
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const updated = { ...v, [field]: val };
        // Auto-update SKU if size or color changes and user hasn't explicitly customized SKU
        if (field === 'size' || field === 'color') {
          updated.sku = generateVariantSku(slug, updated.size, updated.color);
        }
        return updated;
      })
    );
  };

  // Add image item
  const handleAddImage = () => {
    const isFirst = images.length === 0;
    setImages((prev) => [
      ...prev,
      {
        id: `img_${Date.now()}`,
        imageUrl: '',
        altText: '',
        isPrimary: isFirst,
      },
    ]);
  };

  // Remove image item
  const handleRemoveImage = (id: string) => {
    setImages((prev) => {
      const remaining = prev.filter((img) => img.id !== id);
      // Ensure at least one primary image remains if any images left
      if (remaining.length > 0 && !remaining.some((img) => img.isPrimary)) {
        remaining[0].isPrimary = true;
      }
      return remaining;
    });
  };

  // Update image item
  const handleUpdateImage = (id: string, field: keyof ImageFormItem, val: any) => {
    setImages((prev) =>
      prev.map((img) => {
        if (field === 'isPrimary' && val === true) {
          return { ...img, isPrimary: img.id === id };
        }
        if (img.id === id) {
          return { ...img, [field]: val };
        }
        return img;
      })
    );
  };

  // Validate and submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Basic validation
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Product name is required.');
      return;
    }

    const cleanSlug = slug.trim().toLowerCase();
    if (!cleanSlug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cleanSlug)) {
      setErrorMsg('Slug must be lower-case alphanumeric with hyphens (e.g. "classic-crewneck-tee").');
      return;
    }

    if (!categoryId) {
      setErrorMsg('Please select a category for this product.');
      return;
    }

    // 2. Variants validation
    if (variants.length === 0) {
      setErrorMsg('At least one product variant is required.');
      return;
    }

    const seenCombinations = new Set<string>();
    const seenSkus = new Set<string>();
    const parsedVariants: CreateProductVariantPayload[] = [];

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const size = v.size.trim();
      const color = v.color.trim();
      const sku = v.sku.trim();

      if (!size) {
        setErrorMsg(`Variant #${i + 1}: Size is required.`);
        return;
      }

      if (!sku) {
        setErrorMsg(`Variant #${i + 1}: SKU is required.`);
        return;
      }

      const comboKey = `${size.toLowerCase()}_${color.toLowerCase()}`;
      if (seenCombinations.has(comboKey)) {
        setErrorMsg(`Duplicate variant combination: Size '${size}' and Color '${color}' already exists in this product.`);
        return;
      }
      seenCombinations.add(comboKey);

      if (seenSkus.has(sku.toUpperCase())) {
        setErrorMsg(`Duplicate SKU detected: '${sku}'. Each variant must possess a unique SKU.`);
        return;
      }
      seenSkus.add(sku.toUpperCase());

      const price = parseFloat(v.priceRupees);
      if (isNaN(price) || price < 0) {
        setErrorMsg(`Variant #${i + 1}: Selling price must be a non-negative number.`);
        return;
      }
      const pricePaise = Math.round(price * 100);

      let comparisonPricePaise: number | null = null;
      if (v.comparisonPriceRupees.trim()) {
        const compPrice = parseFloat(v.comparisonPriceRupees);
        if (isNaN(compPrice) || compPrice < 0) {
          setErrorMsg(`Variant #${i + 1}: Comparison price must be a valid number.`);
          return;
        }
        comparisonPricePaise = Math.round(compPrice * 100);
        if (comparisonPricePaise < pricePaise) {
          setErrorMsg(
            `Variant #${i + 1}: Comparison price (₹${compPrice}) cannot be lower than selling price (₹${price}).`
          );
          return;
        }
      }

      const stock = parseInt(v.stockQuantity, 10);
      if (isNaN(stock) || stock < 0) {
        setErrorMsg(`Variant #${i + 1}: Stock quantity must be a non-negative integer.`);
        return;
      }

      parsedVariants.push({
        size,
        color: color || 'Standard',
        colorHex: v.colorHex.trim() || undefined,
        sku,
        pricePaise,
        comparisonPricePaise,
        stockQuantity: stock,
        isActive: v.isActive,
      });
    }

    // 3. Images validation
    const parsedImages: CreateProductImagePayload[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const url = img.imageUrl.trim();
      if (!url) {
        setErrorMsg(`Image #${i + 1}: Image URL cannot be empty.`);
        return;
      }
      if (!/^https?:\/\//i.test(url)) {
        setErrorMsg(`Image #${i + 1}: Image URL must start with http:// or https://.`);
        return;
      }
      parsedImages.push({
        imageUrl: url,
        altText: img.altText.trim() || null,
        displayOrder: i,
        isPrimary: img.isPrimary,
        color: img.color?.trim() || null,
      });
    }

    // If images are provided but none is primary, mark the first as primary
    if (parsedImages.length > 0 && !parsedImages.some((img) => img.isPrimary)) {
      parsedImages[0].isPrimary = true;
    }

    // 4. Construct payload
    const payload: CreateProductPayload = {
      name: trimmedName,
      slug: cleanSlug,
      description: description.trim(),
      categoryId,
      status,
      isFeatured,
      isNewArrival,
      fabricSpec: fabricSpec.trim() || null,
      variants: parsedVariants,
      images: parsedImages,
    };

    setIsSubmitting(true);
    try {
      await adminCreateProduct(payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create product');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-product-dialog-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-axdoro-surface border border-axdoro-border rounded-2xl shadow-elevated overflow-hidden my-6 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-axdoro-border bg-axdoro-surface sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-axdoro-charcoal text-white">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 id="create-product-dialog-title" className="text-base font-bold text-axdoro-charcoal">
                Add New Product
              </h2>
              <p className="text-xs text-axdoro-text-muted">
                Create a catalogue product with variants, pricing, discounts, and inventory
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-axdoro-text-muted hover:text-axdoro-charcoal p-1.5 rounded-lg border border-axdoro-border hover:bg-axdoro-surface-muted transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body Scrollable Container */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Error Alert */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-900 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* Section 1: Basic Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-1.5 border-b border-axdoro-border">
              <Layers className="w-4 h-4 text-axdoro-accent" />
              <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-axdoro-charcoal">
                1. Basic Information
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Product Name */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="product-name" className="text-xs font-semibold">
                  Product Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="product-name"
                  type="text"
                  required
                  placeholder="e.g. AXDORO Supima Crewneck T-Shirt"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="text-xs"
                />
              </div>

              {/* Slug */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="product-slug" className="text-xs font-semibold">
                    URL Slug <span className="text-red-500">*</span>
                  </Label>
                  {isSlugManual && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSlugManual(false);
                        setSlug(slugify(name));
                      }}
                      className="text-[10px] text-axdoro-accent hover:underline font-mono"
                    >
                      Reset auto-slug
                    </button>
                  )}
                </div>
                <Input
                  id="product-slug"
                  type="text"
                  required
                  placeholder="e.g. axdoro-supima-crewneck-tee"
                  value={slug}
                  onChange={(e) => {
                    setIsSlugManual(true);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  }}
                  className="font-mono text-xs"
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label htmlFor="product-category" className="text-xs font-semibold">
                  Category <span className="text-red-500">*</span>
                </Label>
                {isLoadingCategories ? (
                  <div className="h-9 rounded-md border border-axdoro-border bg-axdoro-surface-muted flex items-center px-3 text-xs text-axdoro-text-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                    Loading categories...
                  </div>
                ) : (
                  <select
                    id="product-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                    className="w-full h-9 rounded-md border border-axdoro-border bg-axdoro-surface px-3 py-1 text-xs text-axdoro-charcoal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-axdoro-accent"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.isActive ? '' : '(Inactive)'}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Publication Status */}
              <div className="space-y-1.5">
                <Label htmlFor="product-status" className="text-xs font-semibold">
                  Publication Status
                </Label>
                <select
                  id="product-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full h-9 rounded-md border border-axdoro-border bg-axdoro-surface px-3 py-1 text-xs text-axdoro-charcoal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-axdoro-accent"
                >
                  <option value="published">Published (Visible in Storefront)</option>
                  <option value="draft">Draft (Hidden from Storefront)</option>
                  <option value="archived">Archived (Unlisted)</option>
                </select>
              </div>

              {/* Fabric Specification */}
              <div className="space-y-1.5">
                <Label htmlFor="product-fabric" className="text-xs font-semibold">
                  Fabric Specification <span className="text-axdoro-text-muted font-normal">(Optional badge)</span>
                </Label>
                <Input
                  id="product-fabric"
                  type="text"
                  placeholder="e.g. 140 GSM, French Linen, Combed Cotton"
                  value={fabricSpec}
                  onChange={(e) => setFabricSpec(e.target.value)}
                  className="text-xs"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="product-description" className="text-xs font-semibold">
                  Product Description
                </Label>
                <textarea
                  id="product-description"
                  rows={3}
                  placeholder="Detailed material, fit, structure, and styling notes..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border border-axdoro-border bg-axdoro-surface px-3 py-2 text-xs text-axdoro-charcoal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-axdoro-accent resize-y"
                />
              </div>

              {/* Feature Badges Toggles */}
              <div className="sm:col-span-2 flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="rounded border-axdoro-border text-axdoro-charcoal focus:ring-axdoro-accent"
                  />
                  <span>Featured Collection Product</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={isNewArrival}
                    onChange={(e) => setIsNewArrival(e.target.checked)}
                    className="rounded border-axdoro-border text-axdoro-charcoal focus:ring-axdoro-accent"
                  />
                  <span>Mark as New Arrival</span>
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Product Variants & Inventory */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1.5 border-b border-axdoro-border">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-axdoro-accent" />
                <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-axdoro-charcoal">
                  2. Variants, Pricing &amp; Stock
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddVariant}
                className="text-xs flex items-center gap-1.5 h-7"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Variant
              </Button>
            </div>

            <div className="space-y-3">
              {variants.map((v, idx) => {
                const price = parseFloat(v.priceRupees) || 0;
                const compPrice = parseFloat(v.comparisonPriceRupees) || 0;
                const discountPercent =
                  compPrice > price && compPrice > 0
                    ? Math.round(((compPrice - price) / compPrice) * 100)
                    : 0;

                return (
                  <div
                    key={v.id}
                    className="p-3.5 rounded-xl border border-axdoro-border bg-axdoro-surface-muted/40 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-axdoro-charcoal">
                          Variant #{idx + 1}
                        </span>
                        {discountPercent > 0 && (
                          <Badge variant="success" className="text-[10px] font-mono">
                            {discountPercent}% OFF
                          </Badge>
                        )}
                      </div>
                      {variants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVariant(v.id)}
                          className="text-red-600 hover:text-red-800 p-1 rounded transition-colors text-xs flex items-center gap-1"
                          title="Remove variant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                      {/* Size */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Size *</Label>
                        <Input
                          type="text"
                          required
                          placeholder="e.g. M"
                          value={v.size}
                          onChange={(e) => handleUpdateVariant(v.id, 'size', e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>

                      {/* Color */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Color *</Label>
                        <Input
                          type="text"
                          required
                          placeholder="e.g. Pitch Black"
                          value={v.color}
                          onChange={(e) => handleUpdateVariant(v.id, 'color', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>

                      {/* Color HEX */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Hex Code</Label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={v.colorHex || '#000000'}
                            onChange={(e) => handleUpdateVariant(v.id, 'colorHex', e.target.value)}
                            className="w-7 h-8 p-0 border border-axdoro-border rounded cursor-pointer bg-transparent"
                          />
                          <Input
                            type="text"
                            placeholder="#000000"
                            value={v.colorHex}
                            onChange={(e) => handleUpdateVariant(v.id, 'colorHex', e.target.value)}
                            className="h-8 text-[11px] font-mono px-1.5"
                          />
                        </div>
                      </div>

                      {/* SKU */}
                      <div className="space-y-1 sm:col-span-2 md:col-span-1">
                        <Label className="text-[11px] font-semibold">SKU *</Label>
                        <Input
                          type="text"
                          required
                          placeholder="AX-PROD-M-BLK"
                          value={v.sku}
                          onChange={(e) => handleUpdateVariant(v.id, 'sku', e.target.value.toUpperCase())}
                          className="h-8 text-[11px] font-mono"
                        />
                      </div>

                      {/* Selling Price in ₹ */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Price (₹) *</Label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          required
                          placeholder="699"
                          value={v.priceRupees}
                          onChange={(e) => handleUpdateVariant(v.id, 'priceRupees', e.target.value)}
                          className="h-8 text-xs font-mono font-bold"
                        />
                      </div>

                      {/* Comparison / Strikethrough Price in ₹ */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Original (₹)</Label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="899"
                          value={v.comparisonPriceRupees}
                          onChange={(e) =>
                            handleUpdateVariant(v.id, 'comparisonPriceRupees', e.target.value)
                          }
                          className="h-8 text-xs font-mono text-axdoro-text-muted"
                          title="Original price before discount (strikethrough)"
                        />
                      </div>

                      {/* Initial Stock Units */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Stock *</Label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          required
                          placeholder="25"
                          value={v.stockQuantity}
                          onChange={(e) => handleUpdateVariant(v.id, 'stockQuantity', e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Initial Images (Optional) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1.5 border-b border-axdoro-border">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-axdoro-accent" />
                <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-axdoro-charcoal">
                  3. Product Images (Optional)
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddImage}
                className="text-xs flex items-center gap-1.5 h-7"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Image URL
              </Button>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs text-stone-700 flex items-start gap-2">
              <Info className="w-4 h-4 text-stone-500 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                You can attach direct image URLs (from Unsplash, Pexels, or Cloudinary) now, or upload local image files directly to Cloudinary using the product image manager once the product is created.
              </div>
            </div>

            {images.length > 0 && (
              <div className="space-y-2.5">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="p-3 rounded-lg border border-axdoro-border bg-axdoro-surface flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex-1 space-y-1">
                      <Input
                        type="url"
                        placeholder="https://images.unsplash.com/... or https://res.cloudinary.com/..."
                        value={img.imageUrl}
                        onChange={(e) => handleUpdateImage(img.id, 'imageUrl', e.target.value)}
                        className="text-xs font-mono h-8"
                      />
                    </div>
                    <div className="w-full sm:w-48 space-y-1">
                      <Input
                        type="text"
                        placeholder="Alt text (e.g. Front View)"
                        value={img.altText}
                        onChange={(e) => handleUpdateImage(img.id, 'altText', e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="w-full sm:w-36 space-y-1">
                      <select
                        value={img.color || ''}
                        onChange={(e) => handleUpdateImage(img.id, 'color', e.target.value)}
                        className="text-xs h-8 px-2 rounded-md border border-axdoro-border bg-axdoro-surface text-axdoro-charcoal w-full"
                        title="Assign to variant color"
                      >
                        <option value="">Shared / All</option>
                        {Array.from(new Set(variants.map((v) => v.color.trim()).filter(Boolean))).map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="primary_product_image"
                          checked={img.isPrimary}
                          onChange={() => handleUpdateImage(img.id, 'isPrimary', true)}
                          className="text-axdoro-accent focus:ring-axdoro-accent"
                        />
                        <span className="font-semibold text-axdoro-charcoal text-[11px]">Primary</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(img.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Remove image"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form Actions Footer */}
          <div className="pt-4 border-t border-axdoro-border flex items-center justify-end gap-3 sticky bottom-0 bg-axdoro-surface py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-axdoro-charcoal text-white hover:bg-black font-semibold flex items-center gap-2 px-5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Product...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Create Product</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
