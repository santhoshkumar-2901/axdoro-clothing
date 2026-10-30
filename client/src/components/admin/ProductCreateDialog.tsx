import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Layers,
  Image as ImageIcon,
  DollarSign,
  Palette,
  Upload,
  ArrowLeft,
  ArrowRight,
  Star,
} from 'lucide-react';
import { Button } from '../ui/button.tsx';
import { Input, Label } from '../ui/input.tsx';
import { Badge } from '../ui/badge.tsx';
import {
  AdminCategory,
  adminGetCategories,
  adminCreateProduct,
  adminGetProductUploadSignature,
  adminCreateStagingSession,
  adminHeartbeatStagingSession,
  adminAbandonStagingSession,
  CreateProductPayload,
  CreateProductVariantPayload,
  CreateProductImagePayload,
} from '../../api/admin.ts';
import { useScrollLock } from '../../utils/scrollLock.ts';

interface ProductCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export interface ColorImageItem {
  id: string; // temporary unique key
  imageUrl: string;
  publicId?: string;
  altText?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  isMain: boolean;
}

export interface SizeStockItem {
  size: string; // 'S', 'M', 'L', 'XL', 'XXL'
  selected: boolean;
  stock: string; // non-negative integer string
}

export interface ColorVariantGroup {
  id: string;
  colorName: string;
  colorHex: string;
  images: ColorImageItem[];
  sizes: SizeStockItem[];
}

export const STANDARD_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

export function createDefaultSizes(): SizeStockItem[] {
  return STANDARD_SIZES.map((size) => ({
    size,
    selected: true,
    stock: '15',
  }));
}


function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}

/**
 * Computes a deterministic 5-character base-36 checksum from the full slug string.
 * Uses FNV-1a 32-bit hash producing over 60 million distinct values.
 */
import { computeSlugChecksum, generateVariantSku } from '../../utils/sku.ts';
export { computeSlugChecksum, generateVariantSku };

/**
 * Resolves which image in a collection of color variants serves as the single product-level primary image.
 *
 * Requirements:
 * 1. Explicit user selection (img.isMain === true) in the first color variant containing images takes precedence.
 * 2. If no image was explicitly selected, the first image (index 0) in that color variant is used.
 * 3. Exactly one image across all uploaded product images receives isPrimary = true.
 */
export function resolvePrimaryImageId(colorVariants: ColorVariantGroup[]): string | null {
  for (const col of colorVariants) {
    if (col.images.length > 0) {
      const explicitMain = col.images.find((img) => img.isMain);
      return explicitMain ? explicitMain.id : col.images[0].id;
    }
  }
  return null;
}

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export const ProductCreateDialog: React.FC<ProductCreateDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  // Global reference-counted scroll lock while product creation dialog is open
  useScrollLock(isOpen);

  // Categories state
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState<boolean>(true);

  // Section 1: Basic Information (PRESERVED)
  const [name, setName] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [isSlugManual, setIsSlugManual] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('published');
  const [isFeatured, setIsFeatured] = useState<boolean>(false);
  const [isNewArrival, setIsNewArrival] = useState<boolean>(true);
  const [fabricSpec, setFabricSpec] = useState<string>('');

  // Section 2: Shared Pricing
  const [sellingPrice, setSellingPrice] = useState<string>('699');
  const [originalPrice, setOriginalPrice] = useState<string>('899');

  // Section 3: Color Variants
  const [colorVariants, setColorVariants] = useState<ColorVariantGroup[]>([
    {
      id: 'color_1',
      colorName: 'Pitch Black',
      colorHex: '#0f0f14',
      images: [],
      sizes: createDefaultSizes(),
    },
  ]);

  // Image upload/URL input helper state
  const [activeUploadColorId, setActiveUploadColorId] = useState<string | null>(null);
  const [uploadingColorId, setUploadingColorId] = useState<string | null>(null);
  const [manualUrlInput, setManualUrlInput] = useState<string>('');
  const [manualAltInput, setManualAltInput] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom size input state per color
  const [activeCustomSizeColorId, setActiveCustomSizeColorId] = useState<string | null>(null);
  const [customSizeInputText, setCustomSizeInputText] = useState<string>('');
  const [customSizeError, setCustomSizeError] = useState<string | null>(null);

  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Staging session lifecycle state
  const [stagingSessionId, setStagingSessionId] = useState<string | null>(null);
  const [stagingSessionError, setStagingSessionError] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const stagingSessionIdRef = useRef<string | null>(null);

  // Track mount status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Sync ref with state
  useEffect(() => {
    stagingSessionIdRef.current = stagingSessionId;
  }, [stagingSessionId]);

  // Staging session creation and 5-minute heartbeat lifecycle
  useEffect(() => {
    if (!isOpen) {
      if (stagingSessionIdRef.current) {
        adminAbandonStagingSession(stagingSessionIdRef.current);
        stagingSessionIdRef.current = null;
        setStagingSessionId(null);
      }
      return;
    }

    let isEffectActive = true;
    let heartbeatInterval: NodeJS.Timeout | null = null;

    adminCreateStagingSession()
      .then((session) => {
        if (!isEffectActive || !isMountedRef.current) {
          adminAbandonStagingSession(session.sessionId);
          return;
        }
        setStagingSessionId(session.sessionId);
        stagingSessionIdRef.current = session.sessionId;
        setStagingSessionError(null);

        // Start 5-minute heartbeat
        heartbeatInterval = setInterval(() => {
          if (!isMountedRef.current || !stagingSessionIdRef.current) return;
          adminHeartbeatStagingSession(stagingSessionIdRef.current).catch((err: unknown) => {
            if (!isMountedRef.current) return;
            console.warn('[Staging Session Heartbeat Error]', err);
            setStagingSessionError('Your editing session could not be renewed. Please submit your changes soon or reload.');
          });
        }, 5 * 60 * 1000);
      })
      .catch((err: unknown) => {
        if (!isMountedRef.current) return;
        const msg = err instanceof Error ? err.message : 'Failed to initialize image staging session';
        setStagingSessionError(msg);
      });

    return () => {
      isEffectActive = false;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, [isOpen]);

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
    }
  };

  // Pricing calculations
  const sellingNum = parseFloat(sellingPrice);
  const originalNum = parseFloat(originalPrice);
  const discountPercent =
    !isNaN(sellingNum) && !isNaN(originalNum) && originalNum > sellingNum && originalNum > 0
      ? Math.round(((originalNum - sellingNum) / originalNum) * 100)
      : 0;

  // Inventory Summary calculation
  const totalInventoryUnits = colorVariants.reduce((sum, col) => {
    return (
      sum +
      col.sizes
        .filter((s) => s.selected)
        .reduce((sub, s) => {
          const q = parseInt(s.stock, 10);
          return sub + (isNaN(q) || q < 0 ? 0 : q);
        }, 0)
    );
  }, 0);

  const totalActiveSizeCombinations = colorVariants.reduce(
    (count, col) => count + col.sizes.filter((s) => s.selected).length,
    0
  );

  // -------------------------------------------------------------
  // Color Variant Handlers
  // -------------------------------------------------------------

  const handleAddColor = () => {
    const colorId = `color_${Date.now()}_${colorVariants.length + 1}`;
    const newColor: ColorVariantGroup = {
      id: colorId,
      colorName: '',
      colorHex: '#3b82f6',
      images: [],
      sizes: createDefaultSizes(),
    };
    setColorVariants((prev) => [...prev, newColor]);
  };

  const handleRemoveColor = (colorId: string) => {
    if (colorVariants.length <= 1) return;
    setColorVariants((prev) => prev.filter((c) => c.id !== colorId));
  };

  const handleColorInfoChange = (
    colorId: string,
    field: 'colorName' | 'colorHex',
    value: string
  ) => {
    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        return { ...col, [field]: value };
      })
    );
  };

  const handleToggleSize = (colorId: string, sizeName: string) => {
    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        const updatedSizes = col.sizes.map((s) =>
          s.size === sizeName ? { ...s, selected: !s.selected } : s
        );
        return { ...col, sizes: updatedSizes };
      })
    );
  };

  const handleStockChange = (colorId: string, sizeName: string, stockVal: string) => {
    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        const updatedSizes = col.sizes.map((s) =>
          s.size === sizeName ? { ...s, stock: stockVal } : s
        );
        return { ...col, sizes: updatedSizes };
      })
    );
  };

  const handleOpenCustomSizeInput = (colorId: string) => {
    setActiveCustomSizeColorId(colorId);
    setCustomSizeInputText('');
    setCustomSizeError(null);
  };

  const handleCancelCustomSizeInput = () => {
    setActiveCustomSizeColorId(null);
    setCustomSizeInputText('');
    setCustomSizeError(null);
  };

  const handleAddCustomSize = (colorId: string) => {
    const trimmedSize = customSizeInputText.trim();
    if (!trimmedSize) {
      setCustomSizeError('Size label cannot be empty.');
      return;
    }
    if (trimmedSize.length > 20) {
      setCustomSizeError('Size label cannot exceed 20 characters.');
      return;
    }

    const targetCol = colorVariants.find((col) => col.id === colorId);
    if (!targetCol) return;

    const lowerTrimmed = trimmedSize.toLowerCase();
    const isDuplicate = targetCol.sizes.some(
      (s) => s.size.trim().toLowerCase() === lowerTrimmed
    );
    if (isDuplicate) {
      setCustomSizeError(`Size "${trimmedSize}" already exists for this color.`);
      return;
    }

    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        const newSizeItem: SizeStockItem = {
          size: trimmedSize,
          selected: true,
          stock: '15',
        };
        return { ...col, sizes: [...col.sizes, newSizeItem] };
      })
    );

    setActiveCustomSizeColorId(null);
    setCustomSizeInputText('');
    setCustomSizeError(null);
  };

  const handleRemoveCustomSize = (colorId: string, sizeName: string) => {
    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        return { ...col, sizes: col.sizes.filter((s) => s.size !== sizeName) };
      })
    );
  };


  // -------------------------------------------------------------
  // Image Handlers per Color
  // -------------------------------------------------------------

  const handleTriggerFileUpload = (colorId: string) => {
    setActiveUploadColorId(colorId);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !activeUploadColorId) return;
    const file = e.target.files[0];
    const targetColorId = activeUploadColorId;

    try {
      setUploadingColorId(targetColorId);
      setErrorMsg(null);

      if (!stagingSessionId) {
        throw new Error('Image staging session is not active. Please wait a moment or reload the modal.');
      }

      // 1. Request signature from server with active staging session
      const signatureConfig = await adminGetProductUploadSignature({ sessionId: stagingSessionId });

      // 2. Upload file directly to Cloudinary
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signatureConfig.apiKey);
      formData.append('timestamp', String(signatureConfig.timestamp));
      formData.append('signature', signatureConfig.signature);
      formData.append('folder', signatureConfig.folder);
      formData.append('public_id', signatureConfig.publicId);

      const cloudRes = await fetch(signatureConfig.uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!cloudRes.ok) {
        const cloudErr = await cloudRes.json().catch(() => ({}));
        throw new Error(
          cloudErr?.error?.message || `Cloudinary upload failed with status ${cloudRes.status}`
        );
      }

      const cloudData = await cloudRes.json();
      const uploadedUrl = cloudData.secure_url || cloudData.url;

      // 3. Attach image to the selected color
      setColorVariants((prev) =>
        prev.map((col) => {
          if (col.id !== targetColorId) return col;
          const isFirstImage = col.images.length === 0;
          const newImg: ColorImageItem = {
            id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            imageUrl: uploadedUrl,
            publicId: cloudData.public_id,
            altText: `${col.colorName || 'Product'} Image`,
            width: cloudData.width,
            height: cloudData.height,
            format: cloudData.format,
            bytes: cloudData.bytes,
            isMain: isFirstImage,
          };
          return { ...col, images: [...col.images, newImg] };
        })
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingColorId(null);
      setActiveUploadColorId(null);
    }
  };

  const handleAddManualUrlImage = (colorId: string) => {
    const trimmedUrl = manualUrlInput.trim();
    if (!trimmedUrl || !/^https?:\/\//i.test(trimmedUrl)) {
      setErrorMsg('Please enter a valid HTTP/HTTPS image URL.');
      return;
    }

    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        const isFirstImage = col.images.length === 0;
        const newImg: ColorImageItem = {
          id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          imageUrl: trimmedUrl,
          altText: manualAltInput.trim() || `${col.colorName || 'Product'} View`,
          isMain: isFirstImage,
        };
        return { ...col, images: [...col.images, newImg] };
      })
    );

    setManualUrlInput('');
    setManualAltInput('');
  };

  const handleSetMainImage = (colorId: string, imageId: string) => {
    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        const updatedImages = col.images.map((img) => ({
          ...img,
          isMain: img.id === imageId,
        }));
        return { ...col, images: updatedImages };
      })
    );
  };

  const handleRemoveImage = (colorId: string, imageId: string) => {
    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        const remaining = col.images.filter((img) => img.id !== imageId);
        if (remaining.length > 0 && !remaining.some((img) => img.isMain)) {
          remaining[0].isMain = true;
        }
        return { ...col, images: remaining };
      })
    );
  };

  const handleMoveImage = (colorId: string, imageIndex: number, direction: 'left' | 'right') => {
    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        const targetIndex = direction === 'left' ? imageIndex - 1 : imageIndex + 1;
        if (targetIndex < 0 || targetIndex >= col.images.length) return col;
        const newImages = [...col.images];
        const [moved] = newImages.splice(imageIndex, 1);
        newImages.splice(targetIndex, 0, moved);
        return { ...col, images: newImages };
      })
    );
  };

  // -------------------------------------------------------------
  // Validation and Form Submission
  // -------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Basic validation (Preserved)
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

    // 2. Pricing Validation
    if (isNaN(sellingNum) || sellingNum <= 0) {
      setErrorMsg('Selling Price must be a valid number greater than 0.');
      return;
    }
    const pricePaise = Math.round(sellingNum * 100);

    let comparisonPricePaise: number | null = null;
    if (originalPrice.trim()) {
      if (isNaN(originalNum) || originalNum <= 0) {
        setErrorMsg('Original Price / MRP must be a positive number.');
        return;
      }
      if (originalNum < sellingNum) {
        setErrorMsg(`Original Price / MRP (₹${originalNum}) cannot be lower than Selling Price (₹${sellingNum}).`);
        return;
      }
      comparisonPricePaise = Math.round(originalNum * 100);
    }

    // 3. Color Variants Validation
    if (colorVariants.length === 0) {
      setErrorMsg('At least one color variant is required.');
      return;
    }

    const seenColorNames = new Set<string>();
    const seenSkus = new Set<string>();
    const parsedVariants: CreateProductVariantPayload[] = [];
    const parsedImages: CreateProductImagePayload[] = [];

    // Exactly one product-level primary image across all color variants
    const primaryImageId = resolvePrimaryImageId(colorVariants);
    let globalImageOrder = 0;

    for (let cIdx = 0; cIdx < colorVariants.length; cIdx++) {
      const col = colorVariants[cIdx];
      const cleanColorName = col.colorName.trim();

      if (!cleanColorName) {
        setErrorMsg(`Color Variant #${cIdx + 1}: Color name is required.`);
        return;
      }

      const lowerName = cleanColorName.toLowerCase();
      if (seenColorNames.has(lowerName)) {
        setErrorMsg(`Duplicate color name "${cleanColorName}". Each color variant must have a unique name.`);
        return;
      }
      seenColorNames.add(lowerName);

      const cleanHex = col.colorHex.trim();
      if (!HEX_COLOR_REGEX.test(cleanHex)) {
        setErrorMsg(`Color Variant "${cleanColorName}": Invalid HEX color code "${cleanHex}". Must be #RGB or #RRGGBB.`);
        return;
      }

      // Check sizes for this color
      const activeSizes = col.sizes.filter((s) => s.selected);
      if (activeSizes.length === 0) {
        setErrorMsg(`Color Variant "${cleanColorName}": Please select at least one available size.`);
        return;
      }

      const seenSizesInColor = new Set<string>();
      for (const s of activeSizes) {
        const cleanSizeLabel = s.size.trim();
        if (!cleanSizeLabel || cleanSizeLabel.length > 20) {
          setErrorMsg(`Color Variant "${cleanColorName}": Size "${s.size}" must be between 1 and 20 characters.`);
          return;
        }

        const lowerSize = cleanSizeLabel.toLowerCase();
        if (seenSizesInColor.has(lowerSize)) {
          setErrorMsg(`Color Variant "${cleanColorName}": Duplicate size "${cleanSizeLabel}" selected.`);
          return;
        }
        seenSizesInColor.add(lowerSize);

        const stockQty = parseInt(s.stock, 10);
        if (isNaN(stockQty) || stockQty < 0) {
          setErrorMsg(`Color Variant "${cleanColorName}", Size ${s.size}: Stock quantity must be a non-negative integer.`);
          return;
        }

        const sku = generateVariantSku(cleanSlug, cleanSizeLabel, cleanColorName, seenSkus);

        parsedVariants.push({
          size: cleanSizeLabel,
          color: cleanColorName,
          colorHex: cleanHex,
          sku,
          pricePaise,
          comparisonPricePaise,
          stockQuantity: stockQty,
          isActive: true,
        });
      }

      // Images for this color (preserves gallery visual order)
      for (let imgIdx = 0; imgIdx < col.images.length; imgIdx++) {
        const img = col.images[imgIdx];
        const isOverallPrimary = img.id === primaryImageId;

        parsedImages.push({
          imageUrl: img.imageUrl,
          altText: img.altText || `${trimmedName} - ${cleanColorName}`,
          displayOrder: globalImageOrder++,
          isPrimary: isOverallPrimary,
          publicId: img.publicId || null,
          width: img.width || null,
          height: img.height || null,
          format: img.format || null,
          bytes: img.bytes || null,
          color: cleanColorName,
        });
      }
    }

    // Verify all variant SKUs are unique within submitted product payload
    if (seenSkus.size !== parsedVariants.length) {
      setErrorMsg('Variant SKU collision detected. All generated variant SKUs must be unique.');
      return;
    }

    // 4. Construct payload and send to backend
    const payload: CreateProductPayload = {
      name: trimmedName,
      slug: cleanSlug,
      description: description.trim(),
      categoryId,
      status,
      isFeatured,
      isNewArrival,
      fabricSpec: fabricSpec.trim() || null,
      stagingSessionId,
      variants: parsedVariants,
      images: parsedImages,
    };

    setIsSubmitting(true);
    try {
      await adminCreateProduct(payload);
      stagingSessionIdRef.current = null;
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
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overscroll-contain animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-product-dialog-title"
      onClick={onClose}
    >
      {/* Hidden file input for Cloudinary uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div
        className="relative w-full max-w-4xl bg-axdoro-surface border border-axdoro-border rounded-2xl shadow-elevated overflow-hidden my-auto flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Preserved layout tokens) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-axdoro-border bg-axdoro-surface shrink-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-axdoro-charcoal text-white">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 id="create-product-dialog-title" className="text-base font-bold text-axdoro-charcoal">
                Add New Product
              </h2>
              <p className="text-xs text-axdoro-text-muted">
                Create a catalogue product with shared pricing, color-specific galleries, and size-level inventory
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-axdoro-text-muted hover:text-axdoro-charcoal p-1.5 rounded-lg border border-axdoro-border hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body Scrollable Container (Preserved layout tokens) */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
          {/* Staging Session Warning Alert */}
          {stagingSessionError && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{stagingSessionError}</div>
            </div>
          )}

          {/* Error Alert */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-900 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* ========================================================= */}
          {/* Section 1: Basic Information (STRICTLY PRESERVED)          */}
          {/* ========================================================= */}
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

          {/* ========================================================= */}
          {/* Section 2: Pricing (NEW)                                  */}
          {/* ========================================================= */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1.5 border-b border-axdoro-border">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-axdoro-accent" />
                <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-axdoro-charcoal">
                  2. Pricing
                </h3>
              </div>
              <span className="text-[11px] text-axdoro-text-muted">
                Applied uniformly across all colors and sizes
              </span>
            </div>

            <div className="p-4 rounded-xl border border-axdoro-border bg-axdoro-surface-muted/30">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                {/* Selling Price */}
                <div className="space-y-1.5">
                  <Label htmlFor="selling-price" className="text-xs font-semibold">
                    Selling Price (₹) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="selling-price"
                    type="number"
                    step="1"
                    min="1"
                    required
                    placeholder="e.g. 699"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    className="h-9 text-sm font-mono font-bold"
                  />
                </div>

                {/* Original Price / MRP */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="original-price" className="text-xs font-semibold">
                      Original Price / MRP (₹)
                    </Label>
                    <span className="text-[10px] text-axdoro-text-muted">Optional</span>
                  </div>
                  <Input
                    id="original-price"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="e.g. 899"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    className="h-9 text-sm font-mono text-axdoro-text-muted"
                  />
                </div>

                {/* Calculated Discount Display */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-axdoro-text-muted">
                    Discount Percentage
                  </Label>
                  <div className="h-9 rounded-md border border-axdoro-border bg-axdoro-surface flex items-center px-3 justify-between">
                    <span className="text-xs font-mono font-bold text-axdoro-charcoal">
                      {discountPercent > 0 ? `${discountPercent}% OFF` : 'No Discount'}
                    </span>
                    {discountPercent > 0 && (
                      <Badge variant="success" className="text-[10px] font-mono">
                        Active Strikethrough
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* Section 3: Color Variants (NEW)                           */}
          {/* ========================================================= */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1.5 border-b border-axdoro-border">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-axdoro-accent" />
                <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-axdoro-charcoal">
                  3. Color Variants ({colorVariants.length})
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddColor}
                className="text-xs flex items-center gap-1.5 h-7 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Another Color
              </Button>
            </div>

            <div className="space-y-5">
              {colorVariants.map((col, cIdx) => {
                const isValidHex = HEX_COLOR_REGEX.test(col.colorHex.trim());
                const isUploadingThis = uploadingColorId === col.id;

                return (
                  <div
                    key={col.id}
                    className="p-4 sm:p-5 rounded-xl border border-axdoro-border bg-axdoro-surface shadow-xs space-y-4"
                  >
                    {/* Color Header & Swatch Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-axdoro-border/60">
                      <div className="flex items-center gap-3">
                        {/* Live Swatch Preview */}
                        <div
                          className="w-7 h-7 rounded-full border border-axdoro-border shadow-xs shrink-0"
                          style={{ backgroundColor: isValidHex ? col.colorHex : '#000000' }}
                          title={`Color preview: ${col.colorHex}`}
                        />
                        <span className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider">
                          Color Variant #{cIdx + 1}
                        </span>
                      </div>

                      {colorVariants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveColor(col.id)}
                          className="text-red-600 hover:text-red-800 p-1 rounded transition-colors text-xs flex items-center gap-1 self-end sm:self-auto cursor-pointer"
                          title="Remove color variant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove Color</span>
                        </button>
                      )}
                    </div>

                    {/* A. Color Information */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Color Name */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">
                          Color Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          type="text"
                          required
                          placeholder="e.g. Navy Blue, Pitch Black, Olive Drab"
                          value={col.colorName}
                          onChange={(e) => handleColorInfoChange(col.id, 'colorName', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>

                      {/* Hex Code + Two-Way Synchronized Color Picker */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">
                          Hex Code <span className="text-red-500">*</span>
                        </Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={isValidHex ? col.colorHex : '#000000'}
                            onChange={(e) => handleColorInfoChange(col.id, 'colorHex', e.target.value)}
                            className="w-8 h-8 p-0 border border-axdoro-border rounded-md cursor-pointer bg-transparent"
                            title="Choose color with picker"
                          />
                          <Input
                            type="text"
                            required
                            placeholder="#001F3F"
                            value={col.colorHex}
                            onChange={(e) => handleColorInfoChange(col.id, 'colorHex', e.target.value)}
                            className="h-8 text-xs font-mono px-2.5 flex-1"
                          />
                        </div>
                      </div>
                    </div>

                    {/* B. Color-Specific Product Images */}
                    <div className="space-y-3 pt-2 border-t border-axdoro-border/60">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-axdoro-charcoal flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-axdoro-accent" />
                            {col.colorName ? `${col.colorName} Images` : 'Color Images'}
                          </span>
                          <p className="text-[11px] text-axdoro-text-muted">
                            First image is designated as the Main Image for this color
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isUploadingThis}
                            onClick={() => handleTriggerFileUpload(col.id)}
                            className="h-7 text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            {isUploadingThis ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Upload className="w-3 h-3 text-axdoro-accent" />
                            )}
                            Upload Image
                          </Button>
                        </div>
                      </div>

                      {/* Image Gallery Track */}
                      {col.images.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                          {col.images.map((img, imgIdx) => (
                            <div
                              key={img.id}
                              className={`relative group rounded-lg border overflow-hidden bg-axdoro-surface transition-all ${
                                img.isMain
                                  ? 'border-axdoro-charcoal ring-2 ring-axdoro-charcoal/20 shadow-xs'
                                  : 'border-axdoro-border'
                              }`}
                            >
                              <div className="aspect-3/4 relative overflow-hidden bg-neutral-100">
                                <img
                                  src={img.imageUrl}
                                  alt={img.altText || 'Color image'}
                                  className="w-full h-full object-cover"
                                />
                                {img.isMain && (
                                  <div className="absolute top-1.5 left-1.5">
                                    <Badge className="text-[9px] font-mono bg-axdoro-charcoal text-white flex items-center gap-1 px-1.5 py-0.5">
                                      <Star className="w-2.5 h-2.5 fill-current" />
                                      Main
                                    </Badge>
                                  </div>
                                )}
                              </div>

                              {/* Image action buttons */}
                              <div className="p-1.5 bg-axdoro-surface flex items-center justify-between border-t border-axdoro-border text-xs">
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    disabled={imgIdx === 0}
                                    onClick={() => handleMoveImage(col.id, imgIdx, 'left')}
                                    className="p-1 rounded text-axdoro-text-muted hover:text-axdoro-charcoal disabled:opacity-30 cursor-pointer"
                                    title="Move left"
                                  >
                                    <ArrowLeft className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={imgIdx === col.images.length - 1}
                                    onClick={() => handleMoveImage(col.id, imgIdx, 'right')}
                                    className="p-1 rounded text-axdoro-text-muted hover:text-axdoro-charcoal disabled:opacity-30 cursor-pointer"
                                    title="Move right"
                                  >
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="flex items-center gap-1">
                                  {!img.isMain && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetMainImage(col.id, img.id)}
                                      className="text-[10px] text-axdoro-accent hover:underline font-medium cursor-pointer"
                                    >
                                      Set Main
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveImage(col.id, img.id)}
                                    className="p-1 rounded text-red-600 hover:text-red-800 cursor-pointer"
                                    title="Remove image"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 rounded-lg border border-dashed border-axdoro-border bg-axdoro-surface-muted/20 text-center space-y-1">
                          <p className="text-xs text-axdoro-text-muted">
                            No images uploaded for {col.colorName || 'this color'} yet.
                          </p>
                          <p className="text-[10px] text-axdoro-text-muted">
                            Upload high-resolution photography specific to this colorway.
                          </p>
                        </div>
                      )}

                      {/* Direct URL Accordion Option */}
                      <details className="text-xs text-axdoro-text-muted">
                        <summary className="cursor-pointer hover:text-axdoro-charcoal transition-colors font-medium">
                          + Or paste direct image URL (Unsplash / CDN)
                        </summary>
                        <div className="pt-2 flex flex-col sm:flex-row gap-2 items-center">
                          <Input
                            type="url"
                            placeholder="https://images.unsplash.com/..."
                            value={manualUrlInput}
                            onChange={(e) => setManualUrlInput(e.target.value)}
                            className="h-8 text-xs font-mono flex-1"
                          />
                          <Input
                            type="text"
                            placeholder="Alt description"
                            value={manualAltInput}
                            onChange={(e) => setManualAltInput(e.target.value)}
                            className="h-8 text-xs sm:w-44"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddManualUrlImage(col.id)}
                            className="h-8 text-xs shrink-0 cursor-pointer"
                          >
                            Add URL
                          </Button>
                        </div>
                      </details>
                    </div>

                    {/* C. Size Availability & Stock */}
                    <div className="space-y-2.5 pt-2 border-t border-axdoro-border/60">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <Label className="text-xs font-semibold text-axdoro-charcoal block">
                            Size Availability &amp; Stock Quantities
                          </Label>
                          <p className="text-[11px] text-axdoro-text-muted">
                            Toggle available sizes for this color and set initial inventory units:
                          </p>
                        </div>
                        {activeCustomSizeColorId !== col.id && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenCustomSizeInput(col.id)}
                            className="h-7 text-xs flex items-center gap-1 cursor-pointer shrink-0 self-start sm:self-auto"
                          >
                            <Plus className="w-3.5 h-3.5 text-axdoro-accent" />
                            + Custom Size
                          </Button>
                        )}
                      </div>

                      {/* Inline Custom Size Adder */}
                      {activeCustomSizeColorId === col.id && (
                        <div className="p-3 rounded-lg border border-axdoro-border bg-axdoro-surface-muted/40 space-y-2 animate-in fade-in">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-axdoro-charcoal">
                              Add Custom Size for {col.colorName || 'this color'}
                            </span>
                            <button
                              type="button"
                              onClick={handleCancelCustomSizeInput}
                              className="text-axdoro-text-muted hover:text-axdoro-charcoal p-0.5 cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 items-center">
                            <Input
                              type="text"
                              placeholder="e.g. 38 (S), 40 (M), 42 (L), 3XL"
                              maxLength={20}
                              value={customSizeInputText}
                              onChange={(e) => {
                                setCustomSizeInputText(e.target.value);
                                if (customSizeError) setCustomSizeError(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddCustomSize(col.id);
                                }
                              }}
                              className="h-8 text-xs font-mono flex-1"
                              autoFocus
                            />
                            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleAddCustomSize(col.id)}
                                className="h-8 text-xs bg-axdoro-charcoal text-white hover:bg-neutral-800 cursor-pointer"
                              >
                                Add Size
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelCustomSizeInput}
                                className="h-8 text-xs cursor-pointer"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                          {customSizeError && (
                            <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              {customSizeError}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                        {col.sizes.map((s) => (
                          <div
                            key={s.size}
                            className={`p-2.5 rounded-lg border transition-all ${
                              s.selected
                                ? 'border-axdoro-charcoal bg-axdoro-surface shadow-2xs'
                                : 'border-axdoro-border/70 bg-axdoro-surface-muted/30 opacity-70'
                            }`}
                          >
                            <label className="flex items-center justify-between cursor-pointer pb-1.5 border-b border-axdoro-border/40 gap-1.5">
                              <div className="flex items-center gap-1 min-w-0 flex-1">
                                <span className="text-xs font-mono font-bold text-axdoro-charcoal truncate" title={`Size ${s.size}`}>
                                  Size {s.size}
                                </span>
                                {!STANDARD_SIZES.includes(s.size) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleRemoveCustomSize(col.id, s.size);
                                    }}
                                    className="text-axdoro-text-muted hover:text-red-600 p-0.5 rounded cursor-pointer transition-colors shrink-0"
                                    title={`Remove custom size ${s.size}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              <input
                                type="checkbox"
                                checked={s.selected}
                                onChange={() => handleToggleSize(col.id, s.size)}
                                className="rounded border-axdoro-border text-axdoro-charcoal focus:ring-axdoro-accent shrink-0"
                              />
                            </label>

                            <div className="pt-2 space-y-1">
                              {s.selected ? (
                                <>
                                  <div className="flex items-center justify-between text-[10px] text-axdoro-text-muted">
                                    <span>Stock</span>
                                    <span>Units</span>
                                  </div>
                                  <Input
                                    type="number"
                                    step="1"
                                    min="0"
                                    required={s.selected}
                                    placeholder="Units"
                                    value={s.stock}
                                    onChange={(e) => handleStockChange(col.id, s.size, e.target.value)}
                                    className="h-7 text-xs font-mono text-center font-bold"
                                  />
                                </>
                              ) : (
                                <div className="h-10 flex items-center justify-center text-[11px] text-axdoro-text-muted italic">
                                  Not available
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ========================================================= */}
          {/* Section 4: Inventory Summary (NEW)                        */}
          {/* ========================================================= */}
          <div className="p-4 rounded-xl border border-axdoro-border bg-axdoro-surface-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider font-bold text-axdoro-charcoal block">
                4. Inventory Summary
              </span>
              <p className="text-xs text-axdoro-text-muted mt-0.5">
                Automatically calculated sum of stock quantities across all active color-size variants
              </p>
            </div>
            <div className="flex items-center gap-4 self-end sm:self-auto">
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-axdoro-text-muted block">
                  Active Variants
                </span>
                <span className="text-xs font-mono font-bold text-axdoro-charcoal">
                  {totalActiveSizeCombinations} SKUs
                </span>
              </div>
              <div className="text-right pl-4 border-l border-axdoro-border">
                <span className="text-[10px] uppercase tracking-wider text-axdoro-text-muted block">
                  Total Inventory
                </span>
                <span className="text-base font-mono font-bold text-axdoro-accent">
                  {totalInventoryUnits} Units
                </span>
              </div>
            </div>
          </div>

          {/* Form Actions Footer (Preserved layout tokens) */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-axdoro-border shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="text-xs bg-axdoro-charcoal hover:bg-neutral-800 text-white min-w-[140px] cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Creating Product...
                </>
              ) : (
                'Create Product'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
