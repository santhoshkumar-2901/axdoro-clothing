import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  adminGetProductDetails,
  adminUpdateProduct,
  adminGetProductUploadSignature,
  adminCreateStagingSession,
  adminHeartbeatStagingSession,
  adminAbandonStagingSession,
  UpdateProductPayload,
  UpdateProductVariantItemPayload,
  UpdateProductImageItemPayload,
} from '../../api/admin.ts';
import { useScrollLock } from '../../utils/scrollLock.ts';

interface ProductEditDialogProps {
  productId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export interface EditColorImageItem {
  id: string; // Database UUID or temporary ID for new upload
  isNew: boolean;
  imageUrl: string;
  publicId?: string;
  altText?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  isMain: boolean;
}

export interface EditSizeStockItem {
  size: string; // 'S', 'M', 'L', 'XL', 'XXL', or custom size e.g. '38 (S)'
  selected: boolean;
  stock: string;
  variantId?: string; // Existing DB variant UUID if mapped from existing variant
  sku?: string; // Existing variant SKU
  isCustom?: boolean;
}

export interface EditColorVariantGroup {
  id: string;
  colorName: string;
  colorHex: string;
  images: EditColorImageItem[];
  sizes: EditSizeStockItem[];
}

export const STANDARD_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export const ProductEditDialog: React.FC<ProductEditDialogProps> = ({
  productId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  // Global reference-counted scroll lock while product editing dialog is open
  useScrollLock(isOpen && Boolean(productId));

  // Staging session lifecycle ref & state
  const [stagingSessionId, setStagingSessionId] = useState<string | null>(null);
  const [stagingSessionError, setStagingSessionError] = useState<string | null>(null);
  const stagingSessionIdRef = useRef<string | null>(null);

  // Hidden file input for Cloudinary image uploads
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingColorId, setUploadingColorId] = useState<string | null>(null);

  // Direct image URL accordion state
  const [manualUrlInput, setManualUrlInput] = useState<string>('');
  const [manualAltInput, setManualAltInput] = useState<string>('');

  // Custom Size addition state
  const [activeCustomSizeColorId, setActiveCustomSizeColorId] = useState<string | null>(null);
  const [customSizeInputText, setCustomSizeInputText] = useState<string>('');
  const [customSizeError, setCustomSizeError] = useState<string | null>(null);

  // Loading and error state
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Concurrency tracking (Safeguard 9: Optimistic Concurrency Control)
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);

  // Section 1: Basic Information (PRESERVED)
  const [name, setName] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [isSlugManual, setIsSlugManual] = useState<boolean>(true);
  const [description, setDescription] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('published');
  const [isFeatured, setIsFeatured] = useState<boolean>(false);
  const [isNewArrival, setIsNewArrival] = useState<boolean>(false);
  const [fabricSpec, setFabricSpec] = useState<string>('');

  // Section 2: Shared Pricing & Legacy Pricing Variance Guard
  const [sellingPrice, setSellingPrice] = useState<string>('699');
  const [originalPrice, setOriginalPrice] = useState<string>('');
  const [hasLegacyPriceConflict, setHasLegacyPriceConflict] = useState<boolean>(false);
  const [legacyPriceRange, setLegacyPriceRange] = useState<{
    minSelling: number;
    maxSelling: number;
    minOriginal?: number;
    maxOriginal?: number;
  }>({ minSelling: 0, maxSelling: 0 });
  const [legacyPriceConfirmed, setLegacyPriceConfirmed] = useState<boolean>(true);

  // Section 3: Color Variants
  const [colorVariants, setColorVariants] = useState<EditColorVariantGroup[]>([]);

  // -------------------------------------------------------------
  // Load Product Data and Grouping
  // -------------------------------------------------------------
  const loadProductData = useCallback(async (id: string) => {
    setIsLoading(true);
    setLoadError(null);
    setErrorMsg(null);

    try {
      const [cats, prod] = await Promise.all([
        adminGetCategories(),
        adminGetProductDetails(id),
      ]);

      setCategories(cats);
      setExpectedUpdatedAt(prod.updatedAt || (prod as any).updated_at);
      setName(prod.name || '');
      setSlug(prod.slug || '');
      setIsSlugManual(true);
      setDescription(prod.description || '');
      setCategoryId(prod.categoryId || (prod as any).category_id || '');
      setStatus((prod.status as 'draft' | 'published' | 'archived') || 'published');
      setIsFeatured(Boolean(prod.isFeatured ?? (prod as any).is_featured));
      setIsNewArrival(Boolean(prod.isNewArrival ?? (prod as any).is_new_arrival));
      setFabricSpec(prod.fabricSpec || (prod as any).fabric_spec || '');

      // Pricing & Legacy Price Conflict Inspection
      const activeVariants = (prod.variants || []).filter((v) => v.isActive);
      const variantsToCheck = activeVariants.length > 0 ? activeVariants : (prod.variants || []);

      if (variantsToCheck.length > 0) {
        const sellingPrices = variantsToCheck.map((v) => v.pricePaise / 100);
        const originalPrices = variantsToCheck
          .map((v) => (v.comparisonPricePaise != null ? v.comparisonPricePaise / 100 : null))
          .filter((p): p is number => p != null);

        const minSelling = Math.min(...sellingPrices);
        const maxSelling = Math.max(...sellingPrices);
        const hasSellingDiff = minSelling !== maxSelling;

        const minOriginal = originalPrices.length > 0 ? Math.min(...originalPrices) : undefined;
        const maxOriginal = originalPrices.length > 0 ? Math.max(...originalPrices) : undefined;
        const hasOriginalDiff =
          minOriginal !== undefined && maxOriginal !== undefined && minOriginal !== maxOriginal;

        if (hasSellingDiff || hasOriginalDiff) {
          setHasLegacyPriceConflict(true);
          setLegacyPriceRange({
            minSelling,
            maxSelling,
            minOriginal,
            maxOriginal,
          });
          setLegacyPriceConfirmed(false);
        } else {
          setHasLegacyPriceConflict(false);
          setLegacyPriceConfirmed(true);
        }

        setSellingPrice(minSelling.toString());
        if (minOriginal !== undefined) {
          setOriginalPrice(minOriginal.toString());
        } else {
          setOriginalPrice('');
        }
      } else {
        setSellingPrice('699');
        setOriginalPrice('');
        setHasLegacyPriceConflict(false);
        setLegacyPriceConfirmed(true);
      }

      // Map existing variants by color
      const colorMap = new Map<
        string,
        {
          colorName: string;
          colorHex: string;
          variants: typeof prod.variants;
        }
      >();

      for (const v of prod.variants || []) {
        const cName = v.color.trim();
        const existing = colorMap.get(cName);
        if (existing) {
          existing.variants.push(v);
          if (!existing.colorHex && v.colorHex) {
            existing.colorHex = v.colorHex;
          }
        } else {
          colorMap.set(cName, {
            colorName: cName,
            colorHex: v.colorHex || '#000000',
            variants: [v],
          });
        }
      }

      // Also inspect if any images have colors not yet in colorMap
      for (const img of prod.images || []) {
        if (img.color && img.color.trim()) {
          const cName = img.color.trim();
          if (!colorMap.has(cName)) {
            colorMap.set(cName, {
              colorName: cName,
              colorHex: '#000000',
              variants: [],
            });
          }
        }
      }

      // If no color exists at all (e.g. empty product)
      if (colorMap.size === 0) {
        colorMap.set('Default', {
          colorName: 'Default',
          colorHex: '#0f172a',
          variants: [],
        });
      }

      // Build EditColorVariantGroup[]
      const builtColorGroups: EditColorVariantGroup[] = [];
      let isFirstColor = true;

      for (const [cName, colData] of colorMap.entries()) {
        // Collect sizes: standard sizes + any custom sizes in existing variants
        const existingSizes = colData.variants.map((v) => v.size.trim());
        const customSizes = existingSizes.filter((s) => !STANDARD_SIZES.includes(s));
        const distinctSizes = [...STANDARD_SIZES, ...Array.from(new Set(customSizes))];

        const mappedSizes: EditSizeStockItem[] = distinctSizes.map((sizeLabel) => {
          const foundVar = colData.variants.find(
            (v) => v.size.trim().toLowerCase() === sizeLabel.toLowerCase()
          );
          if (foundVar) {
            return {
              size: foundVar.size, // preserve exact size label
              selected: foundVar.isActive, // Safeguard 2: preserve inactive state
              stock: foundVar.stockQuantity.toString(), // Safeguard 8: preserve stock
              variantId: foundVar.id, // Safeguard 8: preserve existing variant ID
              sku: foundVar.sku, // Safeguard 8: preserve existing SKU
              isCustom: !STANDARD_SIZES.includes(sizeLabel),
            };
          } else {
            return {
              size: sizeLabel,
              selected: false,
              stock: '15',
              isCustom: !STANDARD_SIZES.includes(sizeLabel),
            };
          }
        });

        // Images for this color
        // Include images matching color, or if first color, also include orphan images with no color
        const matchingImages = (prod.images || []).filter((img) => {
          if (img.color && img.color.trim().toLowerCase() === cName.toLowerCase()) {
            return true;
          }
          if (isFirstColor && (!img.color || !img.color.trim())) {
            return true;
          }
          return false;
        });

        // Sort matching images by displayOrder
        matchingImages.sort((a, b) => a.displayOrder - b.displayOrder);

        const mappedImages: EditColorImageItem[] = matchingImages.map((img) => ({
          id: img.id, // Safeguard 3: preserve existing image ID
          isNew: false,
          imageUrl: img.imageUrl,
          publicId: img.publicId || undefined,
          altText: img.altText || '',
          width: img.width || undefined,
          height: img.height || undefined,
          format: img.format || undefined,
          bytes: img.bytes || undefined,
          isMain: Boolean(img.isPrimary),
        }));

        builtColorGroups.push({
          id: `col_edit_${builtColorGroups.length}_${Date.now()}`,
          colorName: colData.colorName,
          colorHex: colData.colorHex,
          images: mappedImages,
          sizes: mappedSizes,
        });

        isFirstColor = false;
      }

      setColorVariants(builtColorGroups);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(`Failed to load product details: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // -------------------------------------------------------------
  // Staging Session Lifecycle
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !productId) return;

    loadProductData(productId);

    let sessionTimer: any;
    adminCreateStagingSession()
      .then(({ sessionId }) => {
        setStagingSessionId(sessionId);
        stagingSessionIdRef.current = sessionId;
        setStagingSessionError(null);

        // Heartbeat every 5 minutes (300,000 ms)
        sessionTimer = setInterval(() => {
          adminHeartbeatStagingSession(sessionId).catch((err) => {
            console.warn('[Edit Staging] Heartbeat failed:', err);
          });
        }, 300000);
      })
      .catch((err) => {
        console.warn('[Edit Staging] Failed to initialize staging session:', err);
        setStagingSessionError(
          'Notice: Image staging session protection is inactive. You may still edit product metadata.'
        );
      });

    return () => {
      if (sessionTimer) clearInterval(sessionTimer);
      if (stagingSessionIdRef.current) {
        adminAbandonStagingSession(stagingSessionIdRef.current).catch((err) => {
          console.warn('[Edit Staging] Abandon session warning:', err);
        });
        stagingSessionIdRef.current = null;
      }
    };
  }, [isOpen, productId, loadProductData]);

  // Calculated Pricing Metrics
  const sellingNum = parseFloat(sellingPrice) || 0;
  const originalNum = parseFloat(originalPrice) || 0;
  const discountPercent =
    originalNum > sellingNum && originalNum > 0
      ? Math.round(((originalNum - sellingNum) / originalNum) * 100)
      : 0;

  // Calculated Inventory Metrics
  let totalActiveSizeCombinations = 0;
  let totalInventoryUnits = 0;
  colorVariants.forEach((col) => {
    col.sizes.forEach((s) => {
      if (s.selected) {
        totalActiveSizeCombinations++;
        const parsed = parseInt(s.stock, 10);
        if (!isNaN(parsed) && parsed > 0) {
          totalInventoryUnits += parsed;
        }
      }
    });
  });

  // Handlers for Basic Information
  const handleNameChange = (val: string) => {
    setName(val);
    if (!isSlugManual) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (val: string) => {
    setIsSlugManual(true);
    setSlug(slugify(val));
  };

  // Handlers for Color Variants
  const handleAddColor = () => {
    const newCol: EditColorVariantGroup = {
      id: `col_new_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      colorName: '',
      colorHex: '#1e293b',
      images: [],
      sizes: STANDARD_SIZES.map((size) => ({
        size,
        selected: true,
        stock: '15',
      })),
    };
    setColorVariants([...colorVariants, newCol]);
  };

  const handleRemoveColor = (id: string) => {
    if (colorVariants.length <= 1) return;
    setColorVariants(colorVariants.filter((col) => col.id !== id));
  };

  const handleColorInfoChange = (
    id: string,
    field: 'colorName' | 'colorHex',
    value: string
  ) => {
    setColorVariants((prev) =>
      prev.map((col) => (col.id === id ? { ...col, [field]: value } : col))
    );
  };

  // Handlers for Sizes & Stock
  const handleToggleSize = (colorId: string, sizeName: string) => {
    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        return {
          ...col,
          sizes: col.sizes.map((s) =>
            s.size === sizeName ? { ...s, selected: !s.selected } : s
          ),
        };
      })
    );
  };

  const handleStockChange = (colorId: string, sizeName: string, stockVal: string) => {
    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        return {
          ...col,
          sizes: col.sizes.map((s) =>
            s.size === sizeName ? { ...s, stock: stockVal } : s
          ),
        };
      })
    );
  };

  // Custom Size Addition within Color
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
    const trimmed = customSizeInputText.trim();
    if (!trimmed) {
      setCustomSizeError('Size label cannot be empty.');
      return;
    }
    if (trimmed.length > 20) {
      setCustomSizeError('Size label must be at most 20 characters.');
      return;
    }

    const targetColor = colorVariants.find((c) => c.id === colorId);
    if (!targetColor) return;

    const lowerTarget = trimmed.toLowerCase();
    const alreadyExists = targetColor.sizes.some(
      (s) => s.size.trim().toLowerCase() === lowerTarget
    );
    if (alreadyExists) {
      setCustomSizeError(`Size "${trimmed}" already exists for this color.`);
      return;
    }

    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        return {
          ...col,
          sizes: [
            ...col.sizes,
            {
              size: trimmed,
              selected: true,
              stock: '15',
              isCustom: true,
            },
          ],
        };
      })
    );

    setActiveCustomSizeColorId(null);
    setCustomSizeInputText('');
    setCustomSizeError(null);
  };

  const handleRemoveCustomSize = (colorId: string, sizeLabel: string) => {
    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        return {
          ...col,
          sizes: col.sizes.filter((s) => s.size !== sizeLabel),
        };
      })
    );
  };

  // Handlers for Color Images & Primary Image Management
  const handleSetMainImage = (targetGroupId: string, imageId: string) => {
    setColorVariants((prev) =>
      prev.map((col) => ({
        ...col,
        images: col.images.map((img) => ({
          ...img,
          isMain: col.id === targetGroupId && img.id === imageId,
        })),
      }))
    );
  };

  const handleRemoveImage = (targetGroupId: string, imageId: string) => {
    setColorVariants((prev) => {
      let removedWasMain = false;
      const updated = prev.map((col) => {
        if (col.id !== targetGroupId) return col;
        const filtered = col.images.filter((img) => {
          if (img.id === imageId && img.isMain) {
            removedWasMain = true;
          }
          return img.id !== imageId;
        });
        return { ...col, images: filtered };
      });

      // If removed image was main, assign main to the first available image
      if (removedWasMain) {
        let assigned = false;
        for (const col of updated) {
          if (col.images.length > 0 && !assigned) {
            col.images[0].isMain = true;
            assigned = true;
          }
        }
      }
      return updated;
    });
  };

  const handleMoveImage = (
    colorId: string,
    index: number,
    direction: 'left' | 'right'
  ) => {
    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        const newImgs = [...col.images];
        const targetIdx = direction === 'left' ? index - 1 : index + 1;
        if (targetIdx < 0 || targetIdx >= newImgs.length) return col;
        const temp = newImgs[index];
        newImgs[index] = newImgs[targetIdx];
        newImgs[targetIdx] = temp;
        return { ...col, images: newImgs };
      })
    );
  };

  // Cloudinary Staged Upload
  const handleTriggerFileUpload = (colorId: string) => {
    setUploadingColorId(colorId);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetColorId = uploadingColorId;
    if (!file || !targetColorId) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
      setErrorMsg('Only JPEG, PNG, WEBP, and AVIF image files are supported.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Image size cannot exceed 10 MB.');
      return;
    }

    const targetColor = colorVariants.find((c) => c.id === targetColorId);
    const colorLabel = targetColor?.colorName || 'Default';

    try {
      setErrorMsg(null);
      const signatureData = await adminGetProductUploadSignature({
        sessionId: stagingSessionId || undefined,
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signatureData.apiKey);
      formData.append('timestamp', signatureData.timestamp.toString());
      formData.append('signature', signatureData.signature);
      formData.append('folder', signatureData.folder);
      formData.append('public_id', signatureData.publicId);

      const uploadRes = await fetch(signatureData.uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Cloudinary upload failed with status ${uploadRes.status}`);
      }

      const uploadJson = await uploadRes.json();

      // Check if this will be the very first image across all colors
      const totalExistingImages = colorVariants.reduce(
        (sum, c) => sum + c.images.length,
        0
      );
      const isFirstImage = totalExistingImages === 0;

      const newImageItem: EditColorImageItem = {
        id: `img_staged_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        isNew: true,
        imageUrl: uploadJson.secure_url,
        publicId: uploadJson.public_id,
        altText: `${name || 'Product'} - ${colorLabel}`,
        width: uploadJson.width,
        height: uploadJson.height,
        format: uploadJson.format,
        bytes: uploadJson.bytes,
        isMain: isFirstImage,
      };

      setColorVariants((prev) =>
        prev.map((col) => {
          if (col.id !== targetColorId) return col;
          return {
            ...col,
            images: [...col.images, newImageItem],
          };
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Image upload failed: ${msg}`);
    } finally {
      setUploadingColorId(null);
    }
  };

  // Direct URL Image Addition
  const handleAddManualUrlImage = (colorId: string) => {
    const trimmedUrl = manualUrlInput.trim();
    if (!trimmedUrl) return;

    try {
      new URL(trimmedUrl);
    } catch {
      setErrorMsg('Please enter a valid HTTP/HTTPS image URL.');
      return;
    }

    const totalExistingImages = colorVariants.reduce(
      (sum, c) => sum + c.images.length,
      0
    );
    const isFirstImage = totalExistingImages === 0;

    const newImageItem: EditColorImageItem = {
      id: `img_url_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      isNew: true,
      imageUrl: trimmedUrl,
      altText: manualAltInput.trim() || `${name || 'Product'} image`,
      isMain: isFirstImage,
    };

    setColorVariants((prev) =>
      prev.map((col) => {
        if (col.id !== colorId) return col;
        return {
          ...col,
          images: [...col.images, newImageItem],
        };
      })
    );

    setManualUrlInput('');
    setManualAltInput('');
  };

  // -------------------------------------------------------------
  // Submission (Single Atomic Transaction Endpoint)
  // -------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Validate Basic Information
    const trimmedName = name.trim();
    const cleanSlug = slug.trim().toLowerCase();
    if (!trimmedName) {
      setErrorMsg('Product name is required.');
      return;
    }
    if (!cleanSlug) {
      setErrorMsg('URL slug is required.');
      return;
    }
    if (!categoryId) {
      setErrorMsg('Please select a product category.');
      return;
    }

    // 2. Validate Pricing
    const priceRupees = parseFloat(sellingPrice);
    if (isNaN(priceRupees) || priceRupees <= 0) {
      setErrorMsg('Selling price must be a valid positive amount.');
      return;
    }
    const pricePaise = Math.round(priceRupees * 100);

    let comparisonPricePaise: number | null = null;
    if (originalPrice.trim()) {
      const compRupees = parseFloat(originalPrice);
      if (isNaN(compRupees) || compRupees < priceRupees) {
        setErrorMsg('Original Price (MRP) cannot be less than the selling price.');
        return;
      }
      comparisonPricePaise = Math.round(compRupees * 100);
    }

    // Safeguard: Legacy pricing conflict confirmation
    if (hasLegacyPriceConflict && !legacyPriceConfirmed) {
      setErrorMsg(
        'Please confirm that you want to overwrite conflicting legacy variant prices with the shared pricing.'
      );
      return;
    }

    // 3. Validate Color Variants & Build Payloads
    if (colorVariants.length === 0) {
      setErrorMsg('At least one color variant is required.');
      return;
    }

    const seenColorNames = new Set<string>();
    const parsedVariants: UpdateProductVariantItemPayload[] = [];
    let totalSelectedSizes = 0;

    for (let cIdx = 0; cIdx < colorVariants.length; cIdx++) {
      const col = colorVariants[cIdx];
      const cleanColorName = col.colorName.trim();
      const cleanHex = col.colorHex.trim();

      if (!cleanColorName) {
        setErrorMsg(`Color Variant #${cIdx + 1}: Color name is required.`);
        return;
      }

      const lowerColor = cleanColorName.toLowerCase();
      if (seenColorNames.has(lowerColor)) {
        setErrorMsg(`Duplicate color variant "${cleanColorName}". Color names must be distinct.`);
        return;
      }
      seenColorNames.add(lowerColor);

      if (!HEX_COLOR_REGEX.test(cleanHex)) {
        setErrorMsg(
          `Color Variant "${cleanColorName}": Please enter a valid hex color code (e.g. #001F3F).`
        );
        return;
      }

      // Check sizes for this color
      const seenSizesInColor = new Set<string>();

      for (const s of col.sizes) {
        const cleanSizeLabel = s.size.trim();
        if (!cleanSizeLabel || cleanSizeLabel.length > 20) {
          setErrorMsg(
            `Color Variant "${cleanColorName}": Size "${s.size}" must be between 1 and 20 characters.`
          );
          return;
        }

        const lowerSize = cleanSizeLabel.toLowerCase();
        if (seenSizesInColor.has(lowerSize)) {
          setErrorMsg(
            `Color Variant "${cleanColorName}": Duplicate size "${cleanSizeLabel}" specified.`
          );
          return;
        }
        seenSizesInColor.add(lowerSize);

        const stockQty = parseInt(s.stock, 10);
        if (isNaN(stockQty) || stockQty < 0) {
          setErrorMsg(
            `Color Variant "${cleanColorName}", Size "${s.size}": Stock quantity must be a non-negative integer.`
          );
          return;
        }

        if (s.selected) {
          totalSelectedSizes++;
          parsedVariants.push({
            ...(s.variantId ? { id: s.variantId } : {}),
            size: cleanSizeLabel,
            color: cleanColorName,
            colorHex: cleanHex,
            ...(s.sku ? { sku: s.sku } : {}),
            pricePaise,
            comparisonPricePaise,
            stockQuantity: stockQty,
            isActive: true,
          });
        } else if (s.variantId) {
          // Safeguard 2: Preserve inactive variant without reactivating
          parsedVariants.push({
            id: s.variantId,
            size: cleanSizeLabel,
            color: cleanColorName,
            colorHex: cleanHex,
            sku: s.sku,
            pricePaise,
            comparisonPricePaise,
            stockQuantity: stockQty,
            isActive: false,
          });
        }
      }
    }

    if (totalSelectedSizes === 0) {
      setErrorMsg('At least one size must be active and selected across your color variants.');
      return;
    }

    // 4. Resolve Primary Image and Build Image Payload
    // Safeguard 5 & 6: Zero images supported; exactly one primary if images exist
    let primaryImageId: string | null = null;
    for (const col of colorVariants) {
      const explicitMain = col.images.find((img) => img.isMain);
      if (explicitMain) {
        primaryImageId = explicitMain.id;
        break;
      }
    }
    if (!primaryImageId) {
      for (const col of colorVariants) {
        if (col.images.length > 0) {
          primaryImageId = col.images[0].id;
          break;
        }
      }
    }

    let globalImageOrder = 0;
    const parsedImages: UpdateProductImageItemPayload[] = [];
    for (const col of colorVariants) {
      for (const img of col.images) {
        const isOverallPrimary = img.id === primaryImageId;
        parsedImages.push({
          ...(img.isNew ? {} : { id: img.id }),
          imageUrl: img.imageUrl,
          publicId: img.publicId || null,
          altText: img.altText || `${trimmedName} - ${col.colorName.trim()}`,
          displayOrder: globalImageOrder++,
          isPrimary: isOverallPrimary,
          width: img.width || null,
          height: img.height || null,
          format: img.format || null,
          bytes: img.bytes || null,
          color: col.colorName.trim() || null,
        });
      }
    }

    // 5. Construct Atomic Update Payload
    const payload: UpdateProductPayload = {
      name: trimmedName,
      slug: cleanSlug,
      description: description.trim(),
      categoryId,
      status,
      isFeatured,
      isNewArrival,
      fabricSpec: fabricSpec.trim() || null,
      expectedUpdatedAt: expectedUpdatedAt || null,
      stagingSessionId: stagingSessionId || null,
      variants: parsedVariants,
      images: parsedImages,
    };

    setIsSubmitting(true);
    try {
      await adminUpdateProduct(productId!, payload);
      // Clear staging session ref so unmount cleanup won't abandon committed session
      stagingSessionIdRef.current = null;
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('CONCURRENT_MUTATION_CONFLICT') || msg.includes('modified by another')) {
        setErrorMsg(
          'Concurrent Modification Conflict: This product was modified by another administrator. Please close and reload the latest changes.'
        );
      } else {
        setErrorMsg(msg || 'Failed to update product');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !productId) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overscroll-contain animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-product-dialog-title"
      onClick={onClose}
    >
      {/* Hidden file input for Cloudinary image uploads */}
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
        {/* Header (Preserved layout tokens & solid bg-axdoro-surface) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-axdoro-border bg-axdoro-surface shrink-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-axdoro-charcoal text-white">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 id="edit-product-dialog-title" className="text-base font-bold text-axdoro-charcoal">
                Edit Product
              </h2>
              <p className="text-xs text-axdoro-text-muted">
                Update product information, shared pricing, color-specific galleries, and size inventory
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

        {/* Loading Overlay */}
        {isLoading ? (
          <div className="flex-1 p-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-7 h-7 text-axdoro-charcoal animate-spin" />
            <p className="text-xs text-axdoro-text-muted">Loading product details and catalogue variants...</p>
          </div>
        ) : loadError ? (
          <div className="flex-1 p-8 flex flex-col items-center justify-center space-y-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-xs text-red-600 max-w-md text-center">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => loadProductData(productId)}>
              Retry
            </Button>
          </div>
        ) : (
          /* Form Body Scrollable Container (Preserved layout tokens) */
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
            {/* Staging Session Warning Alert */}
            {stagingSessionError && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{stagingSessionError}</div>
              </div>
            )}

            {/* Error Alert */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-900 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
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
                  <Label htmlFor="edit-product-name" className="text-xs font-semibold">
                    Product Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="edit-product-name"
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
                    <Label htmlFor="edit-product-slug" className="text-xs font-semibold">
                      URL Slug <span className="text-red-500">*</span>
                    </Label>
                    {isSlugManual && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsSlugManual(false);
                          setSlug(slugify(name));
                        }}
                        className="text-[10px] text-axdoro-accent hover:underline font-mono cursor-pointer"
                      >
                        Reset auto-slug
                      </button>
                    )}
                  </div>
                  <Input
                    id="edit-product-slug"
                    type="text"
                    required
                    placeholder="axdoro-supima-crewneck"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>

                {/* Category Selection */}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-product-category" className="text-xs font-semibold">
                    Category <span className="text-red-500">*</span>
                  </Label>
                  <select
                    id="edit-product-category"
                    required
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full h-9 rounded-md border border-axdoro-border bg-axdoro-surface px-3 py-1 text-xs text-axdoro-charcoal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-axdoro-accent"
                  >
                    <option value="" disabled>
                      Select catalogue category
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
                  <Label htmlFor="edit-product-status" className="text-xs font-semibold">
                    Catalogue Status
                  </Label>
                  <select
                    id="edit-product-status"
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
                  <Label htmlFor="edit-product-fabric" className="text-xs font-semibold">
                    Fabric Specification <span className="text-axdoro-text-muted font-normal">(Optional badge)</span>
                  </Label>
                  <Input
                    id="edit-product-fabric"
                    type="text"
                    placeholder="e.g. 140 GSM, French Linen, Combed Cotton"
                    value={fabricSpec}
                    onChange={(e) => setFabricSpec(e.target.value)}
                    className="text-xs"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="edit-product-description" className="text-xs font-semibold">
                    Product Description
                  </Label>
                  <textarea
                    id="edit-product-description"
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
            {/* Section 2: Pricing                                        */}
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

              {/* Legacy Pricing Conflict Warning Alert */}
              {hasLegacyPriceConflict && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2 text-xs text-amber-900 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">
                      <strong>Legacy Pricing Variance Detected:</strong> Existing variants on this product have
                      varying price points (Selling: ₹{legacyPriceRange.minSelling} - ₹{legacyPriceRange.maxSelling}
                      {legacyPriceRange.maxOriginal
                        ? `, MRP: ₹${legacyPriceRange.minOriginal} - ₹${legacyPriceRange.maxOriginal}`
                        : ''}
                      ). Saving this product will apply the shared selling price (₹{sellingPrice}) across all variants.
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-amber-950 pt-1 pl-6">
                    <input
                      type="checkbox"
                      checked={legacyPriceConfirmed}
                      onChange={(e) => setLegacyPriceConfirmed(e.target.checked)}
                      className="rounded border-amber-400 text-axdoro-charcoal focus:ring-axdoro-accent"
                    />
                    <span>I confirm overwriting legacy variant pricing with the shared pricing above</span>
                  </label>
                </div>
              )}

              <div className="p-4 rounded-xl border border-axdoro-border bg-axdoro-surface-muted/30">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  {/* Selling Price */}
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-selling-price" className="text-xs font-semibold">
                      Selling Price (₹) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="edit-selling-price"
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
                      <Label htmlFor="edit-original-price" className="text-xs font-semibold">
                        Original Price / MRP (₹)
                      </Label>
                      <span className="text-[10px] text-axdoro-text-muted">Optional</span>
                    </div>
                    <Input
                      id="edit-original-price"
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
            {/* Section 3: Color Variants                                 */}
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
                              Manage product photography for this colorway (First or chosen image serves as Main)
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
                              Upload photography specific to this colorway or add via URL below.
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
                              Toggle active sizes and adjust live inventory units for this colorway:
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
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleAddCustomSize(col.id)}
                                className="h-8 text-xs bg-axdoro-charcoal text-white hover:bg-neutral-800 shrink-0 cursor-pointer"
                              >
                                Add Size
                              </Button>
                            </div>
                            {customSizeError && (
                              <p className="text-[11px] text-red-600 font-medium">
                                {customSizeError}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Size Stock Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                          {col.sizes.map((s) => (
                            <div
                              key={s.size}
                              className={`p-3 rounded-lg border transition-all ${
                                s.selected
                                  ? 'border-axdoro-charcoal bg-axdoro-surface shadow-xs'
                                  : 'border-axdoro-border/60 bg-axdoro-surface-muted/20 opacity-60'
                              }`}
                            >
                              <label className="flex items-center justify-between cursor-pointer pb-1.5 border-b border-axdoro-border/40">
                                <div className="flex items-center gap-1.5 min-w-0 pr-1">
                                  <span className="text-xs font-mono font-bold text-axdoro-charcoal truncate">
                                    {s.size}
                                  </span>
                                  {s.isCustom && !s.variantId && (
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
                                    Inactive
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
            {/* Section 4: Inventory Summary                              */}
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
                    Saving Changes...
                  </>
                ) : (
                  'Save Product Changes'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
