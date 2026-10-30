import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Image as ImageIcon,
  Upload,
  Link as LinkIcon,
  RotateCcw,
} from 'lucide-react';
import {
  adminGetHomepageCollections,
  adminUpdateHomepageCollection,
  adminUpdateCollectionProducts,
  adminGetProducts,
  adminGetHomepageHero,
  adminGetHeroUploadSignature,
  adminUpdateHomepageHero,
  AdminProduct,
} from '../../api/admin.ts';
import { useScrollLock } from '../../utils/scrollLock.ts';
import {
  AdminHomepageCollection,
  HeroSlide,
  HomepageHeroSetting,
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

  // Default 3 hero slides fallback
  const DEFAULT_HERO_SLIDES: HeroSlide[] = [
    {
      id: 1,
      imageUrl: null,
      heading: 'AXDORO – Clothing Made for Every Occasion',
      subtitle: 'Quality Clothing. Comfortable Wear. Bulk Orders Made Simple.',
      ctaLabel: 'Explore Collection',
      ctaLink: '#collection-tabs',
      isEnabled: true,
    },
    {
      id: 2,
      imageUrl: null,
      heading: 'Tailored Elegance for Work & Celebrations',
      subtitle: 'Refined formalwear and versatile essentials designed with premium breathable cotton and modern silhouettes.',
      ctaLabel: 'Shop Formals',
      ctaLink: '/category/formal',
      isEnabled: true,
    },
    {
      id: 3,
      imageUrl: null,
      heading: 'Seamless Custom Bulk Orders & Uniforms',
      subtitle: 'Elevate your team with personalized fits, high-durability fabrics, and dedicated bulk pricing.',
      ctaLabel: 'Enquire for Bulk Orders',
      ctaLink: 'bulk',
      isEnabled: true,
    },
  ];

  function isValidClientCtaDestination(val: string): { valid: boolean; reason?: string } {
    if (!val || typeof val !== 'string') {
      return { valid: false, reason: 'CTA destination is required' };
    }
    const trimmed = val.trim();
    if (trimmed.length === 0) {
      return { valid: false, reason: 'CTA destination cannot be empty' };
    }

    // Same-site absolute path
    if (trimmed.startsWith('/')) {
      if (trimmed.startsWith('//') || trimmed.includes('\\') || /[\r\n\t]/.test(trimmed)) {
        return { valid: false, reason: 'Protocol-relative or malformed path not allowed' };
      }
      return { valid: true };
    }

    // Anchor
    if (trimmed.startsWith('#')) {
      if (trimmed.length < 2 || /[\r\n\t\s]/.test(trimmed)) {
        return { valid: false, reason: 'Malformed anchor destination' };
      }
      return { valid: true };
    }

    // Approved actions
    const lower = trimmed.toLowerCase();
    if (lower === 'bulk' || lower === 'explore') {
      return { valid: true };
    }

    return {
      valid: false,
      reason: 'Must start with / (path), # (anchor), or be "bulk" or "explore"',
    };
  }

  // Hero banner state
  const [heroSetting, setHeroSetting] = useState<HomepageHeroSetting | null>(null);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(DEFAULT_HERO_SLIDES);
  const [activeSlideId, setActiveSlideId] = useState<number>(1);
  const [editingModalSlideId, setEditingModalSlideId] = useState<number>(1);
  const [isLoadingHero, setIsLoadingHero] = useState<boolean>(true);
  const [isHeroModalOpen, setIsHeroModalOpen] = useState<boolean>(false);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [heroPreviewUrl, setHeroPreviewUrl] = useState<string | null>(null);
  const [heroManualUrl, setHeroManualUrl] = useState<string>('');
  const [useHeroManualUrl, setUseHeroManualUrl] = useState<boolean>(false);
  const [isSavingHero, setIsSavingHero] = useState<boolean>(false);
  const [heroModalError, setHeroModalError] = useState<string | null>(null);
  const [heroError, setHeroError] = useState<string | null>(null);
  const [heroSuccessMessage, setHeroSuccessMessage] = useState<string | null>(null);
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  // Global reference-counted scroll lock for hero image modal
  useScrollLock(isHeroModalOpen);

  const loadHero = useCallback(async () => {
    try {
      setIsLoadingHero(true);
      setHeroError(null);
      const hero = await adminGetHomepageHero();
      setHeroSetting(hero);
      if (Array.isArray(hero.slides) && hero.slides.length === 3) {
        setHeroSlides(hero.slides);
      } else if (hero.imageUrl) {
        setHeroSlides([
          { ...DEFAULT_HERO_SLIDES[0], imageUrl: hero.imageUrl, publicId: hero.publicId || null },
          DEFAULT_HERO_SLIDES[1],
          DEFAULT_HERO_SLIDES[2],
        ]);
      } else {
        setHeroSlides(DEFAULT_HERO_SLIDES);
      }
    } catch (err) {
      console.warn('[CollectionManagementView] Failed to load homepage hero:', err);
      setHeroError(err instanceof Error ? err.message : 'Failed to load hero configuration');
    } finally {
      setIsLoadingHero(false);
    }
  }, []);

  useEffect(() => {
    loadHero();
  }, [loadHero]);

  // Clean up object preview URLs
  useEffect(() => {
    return () => {
      if (heroPreviewUrl && heroPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(heroPreviewUrl);
      }
    };
  }, [heroPreviewUrl]);

  const handleOpenHeroModalForSlot = (slotId: number) => {
    setEditingModalSlideId(slotId);
    const targetSlide = heroSlides.find((s) => s.id === slotId) || heroSlides[0];
    setHeroFile(null);
    setHeroPreviewUrl(targetSlide.imageUrl || null);
    setHeroManualUrl(targetSlide.imageUrl || '');
    setUseHeroManualUrl(false);
    setHeroModalError(null);
    setIsHeroModalOpen(true);
  };

  const handleOpenHeroModal = () => {
    handleOpenHeroModalForSlot(activeSlideId);
  };

  const handleCloseHeroModal = () => {
    if (heroPreviewUrl && heroPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(heroPreviewUrl);
    }
    setHeroFile(null);
    setHeroPreviewUrl(null);
    setHeroManualUrl('');
    setHeroModalError(null);
    setIsHeroModalOpen(false);
  };

  const handleHeroFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (heroPreviewUrl && heroPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(heroPreviewUrl);
      }
      setHeroFile(file);
      setHeroPreviewUrl(URL.createObjectURL(file));
      setHeroModalError(null);
    }
  };

  const handleClearHeroSelectedFile = () => {
    if (heroPreviewUrl && heroPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(heroPreviewUrl);
    }
    setHeroFile(null);
    const targetSlide = heroSlides.find((s) => s.id === editingModalSlideId);
    setHeroPreviewUrl(targetSlide?.imageUrl || null);
    if (heroFileInputRef.current) {
      heroFileInputRef.current.value = '';
    }
  };

  const handleSaveHero = async () => {
    try {
      setIsSavingHero(true);
      setHeroModalError(null);

      let finalImageUrl: string | null = null;
      let finalPublicId: string | null = null;

      if (useHeroManualUrl) {
        if (!heroManualUrl.trim()) {
          setHeroModalError('Please enter an image URL or choose a file.');
          setIsSavingHero(false);
          return;
        }
        finalImageUrl = heroManualUrl.trim();
        finalPublicId = null;
      } else if (heroFile) {
        const sig = await adminGetHeroUploadSignature();
        const formData = new FormData();
        formData.append('file', heroFile);
        formData.append('api_key', sig.apiKey);
        formData.append('timestamp', String(sig.timestamp));
        formData.append('signature', sig.signature);
        formData.append('folder', sig.folder);
        formData.append('public_id', sig.publicId);

        const uploadRes = await fetch(sig.uploadUrl, {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          throw new Error(`Cloudinary upload failed with HTTP ${uploadRes.status}`);
        }

        const uploadData = (await uploadRes.json()) as { secure_url: string; public_id: string };
        finalImageUrl = uploadData.secure_url;
        finalPublicId = uploadData.public_id;
      } else {
        setHeroModalError('Please select a file or enter an image URL.');
        setIsSavingHero(false);
        return;
      }

      const updatedSlides = heroSlides.map((s) =>
        s.id === editingModalSlideId
          ? { ...s, imageUrl: finalImageUrl, publicId: finalPublicId }
          : s
      );

      const updated = await adminUpdateHomepageHero({
        slides: updatedSlides,
      });

      setHeroSetting(updated);
      if (updated.slides) {
        setHeroSlides(updated.slides);
      }
      setHeroSuccessMessage(`Slide ${editingModalSlideId} image updated successfully.`);
      handleCloseHeroModal();
      onCollectionMutated?.();
    } catch (err) {
      setHeroModalError(err instanceof Error ? err.message : 'Failed to update homepage hero');
    } finally {
      setIsSavingHero(false);
    }
  };

  const handleResetSlotImageToDefault = async (slotId: number) => {
    try {
      setIsSavingHero(true);
      setHeroError(null);
      const updatedSlides = heroSlides.map((s) =>
        s.id === slotId ? { ...s, imageUrl: null, publicId: null } : s
      );

      const updated = await adminUpdateHomepageHero({
        slides: updatedSlides,
      });

      setHeroSetting(updated);
      if (updated.slides) {
        setHeroSlides(updated.slides);
      }
      setHeroSuccessMessage(`Slide ${slotId} restored to default asset (/hero-bg.jpg).`);
      onCollectionMutated?.();
    } catch (err) {
      setHeroError(err instanceof Error ? err.message : 'Failed to reset slide image');
    } finally {
      setIsSavingHero(false);
    }
  };

  const handleResetHeroToDefault = async () => {
    try {
      setIsSavingHero(true);
      setHeroError(null);
      const targetSlot = isHeroModalOpen ? editingModalSlideId : activeSlideId;
      const updatedSlides = heroSlides.map((s) =>
        s.id === targetSlot ? { ...s, imageUrl: null, publicId: null } : s
      );

      const updated = await adminUpdateHomepageHero({
        slides: updatedSlides,
      });

      setHeroSetting(updated);
      if (updated.slides) {
        setHeroSlides(updated.slides);
      }
      setHeroSuccessMessage(`Slide ${targetSlot} restored to default asset (/hero-bg.jpg).`);
      if (isHeroModalOpen) {
        handleCloseHeroModal();
      }
      onCollectionMutated?.();
    } catch (err) {
      if (isHeroModalOpen) {
        setHeroModalError(err instanceof Error ? err.message : 'Failed to reset hero banner');
      } else {
        setHeroError(err instanceof Error ? err.message : 'Failed to reset hero banner');
      }
    } finally {
      setIsSavingHero(false);
    }
  };

  const handleSaveAllSlides = async () => {
    try {
      setIsSavingHero(true);
      setHeroError(null);
      setHeroSuccessMessage(null);

      // Validate all slides
      for (const slide of heroSlides) {
        if (!slide.heading.trim()) {
          setHeroError(`Slide ${slide.id}: Heading is required.`);
          setActiveSlideId(slide.id);
          setIsSavingHero(false);
          return;
        }
        if (slide.heading.length > 200) {
          setHeroError(`Slide ${slide.id}: Heading cannot exceed 200 characters.`);
          setActiveSlideId(slide.id);
          setIsSavingHero(false);
          return;
        }
        if (!slide.subtitle.trim()) {
          setHeroError(`Slide ${slide.id}: Subtitle is required.`);
          setActiveSlideId(slide.id);
          setIsSavingHero(false);
          return;
        }
        if (slide.subtitle.length > 300) {
          setHeroError(`Slide ${slide.id}: Subtitle cannot exceed 300 characters.`);
          setActiveSlideId(slide.id);
          setIsSavingHero(false);
          return;
        }
        if (!slide.ctaLabel.trim()) {
          setHeroError(`Slide ${slide.id}: CTA label is required.`);
          setActiveSlideId(slide.id);
          setIsSavingHero(false);
          return;
        }
        if (slide.ctaLabel.length > 50) {
          setHeroError(`Slide ${slide.id}: CTA label cannot exceed 50 characters.`);
          setActiveSlideId(slide.id);
          setIsSavingHero(false);
          return;
        }
        const ctaValidation = isValidClientCtaDestination(slide.ctaLink);
        if (!ctaValidation.valid) {
          setHeroError(`Slide ${slide.id}: ${ctaValidation.reason || 'Invalid CTA destination'}`);
          setActiveSlideId(slide.id);
          setIsSavingHero(false);
          return;
        }
      }

      const updated = await adminUpdateHomepageHero({
        slides: heroSlides,
      });

      setHeroSetting(updated);
      if (updated.slides) {
        setHeroSlides(updated.slides);
      }
      setHeroSuccessMessage('All homepage hero slides updated successfully.');
      onCollectionMutated?.();
    } catch (err) {
      setHeroError(err instanceof Error ? err.message : 'Failed to update homepage hero slides');
    } finally {
      setIsSavingHero(false);
    }
  };

  const handleActiveSlideChange = <K extends keyof HeroSlide>(key: K, value: HeroSlide[K]) => {
    setHeroSlides((prev) =>
      prev.map((s) => (s.id === activeSlideId ? { ...s, [key]: value } : s))
    );
    if (heroError) setHeroError(null);
  };

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
            Homepage Content
          </h2>
          <p className="text-xs text-axdoro-muted mt-1">
            Manage your storefront hero banner and curate featured product collections.
          </p>
        </div>
      </div>

      {/* 1. Homepage Hero Banner Management Section */}
      <Card className="border-axdoro-border bg-axdoro-surface shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-axdoro-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-axdoro-charcoal flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-axdoro-accent" />
                Storefront Hero Lifestyle Banner
              </CardTitle>
              <CardDescription className="text-xs text-axdoro-text-muted mt-0.5">
                Manage the three rotating hero slides displayed at the top of the storefront homepage.
                {heroSetting?.updatedAt && (
                  <span className="ml-2 font-mono text-[10px] text-axdoro-accent-muted">
                    (Last saved: {new Date(heroSetting.updatedAt).toLocaleTimeString()})
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetHeroToDefault}
                disabled={isSavingHero || !heroSlides.find((s) => s.id === activeSlideId)?.imageUrl}
                className="h-8 text-xs font-semibold text-axdoro-text-muted hover:text-red-400 hover:border-red-400/40"
                title="Reset to default /hero-bg.jpg"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset to Default
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleOpenHeroModal}
                disabled={isLoadingHero}
                className="h-8 text-xs font-semibold px-3 shadow-xs flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{heroSlides.find((s) => s.id === activeSlideId)?.imageUrl ? 'Change Hero Image' : 'Upload Hero Image'}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveAllSlides}
                disabled={isSavingHero || isLoadingHero}
                className="h-8 text-xs font-semibold px-3.5 bg-axdoro-purple text-white hover:bg-axdoro-purple-light flex items-center gap-1.5"
              >
                {isSavingHero ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Hero Slides</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Hero Save & Validation Alerts */}
        {heroError && (
          <div className="mx-6 mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Hero Validation Error: </span>
              {heroError}
            </div>
            <button onClick={() => setHeroError(null)} className="text-red-500 hover:text-red-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {heroSuccessMessage && (
          <div className="mx-6 mt-4 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 mt-0.5" />
            <div className="flex-1 font-medium">{heroSuccessMessage}</div>
            <button onClick={() => setHeroSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Slide Slot Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-axdoro-border px-6 pt-3 pb-2 overflow-x-auto">
          {heroSlides.map((slide) => {
            const isSelected = slide.id === activeSlideId;
            return (
              <button
                key={slide.id}
                type="button"
                onClick={() => {
                  setActiveSlideId(slide.id);
                  if (heroError) setHeroError(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 border cursor-pointer ${
                  isSelected
                    ? 'bg-axdoro-purple text-white border-axdoro-purple shadow-xs'
                    : 'bg-axdoro-surface border-axdoro-border text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-surface-muted'
                }`}
              >
                <span>Slide Slot {slide.id}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    slide.isEnabled
                      ? isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-100 text-emerald-800'
                      : isSelected
                      ? 'bg-black/30 text-white/70'
                      : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  {slide.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
                {slide.imageUrl && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-amber-300' : 'bg-amber-500'
                    }`}
                    title="Custom image configured"
                  />
                )}
              </button>
            );
          })}
        </div>

        <CardContent className="pt-4 pb-4">
          {(() => {
            const activeSlide = heroSlides.find((s) => s.id === activeSlideId) || heroSlides[0];
            const ctaCheck = isValidClientCtaDestination(activeSlide.ctaLink);

            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column (5 cols): Live Slide Preview & Image Management */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="text-xs font-semibold text-axdoro-charcoal flex items-center justify-between">
                    <span>Live Banner Preview</span>
                    <span className="text-[11px] font-mono text-axdoro-text-muted">Slot {activeSlide.id}</span>
                  </div>

                  {/* Banner Preview Thumbnail with Overlay Simulation */}
                  <div className="relative w-full h-44 sm:h-52 rounded-lg overflow-hidden border border-axdoro-border bg-axdoro-bg group">
                    <img
                      src={activeSlide.imageUrl || '/hero-bg.jpg'}
                      alt={`Slide ${activeSlide.id} Preview`}
                      className="w-full h-full object-cover object-[75%_center]"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.src.endsWith('/hero-bg.jpg')) {
                          target.src = '/hero-bg.jpg';
                        }
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent pointer-events-none" />

                    {/* Live Dynamic Preview Overlay Content */}
                    <div className="absolute inset-0 p-4 flex flex-col justify-end text-left pointer-events-none">
                      <div className="space-y-1 max-w-xs">
                        <span className="inline-block text-[9px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-black/60 text-[#E5B842] border border-[#E5B842]/30 mb-1">
                          {activeSlide.isEnabled ? 'Active Slide' : 'Slide Disabled (Hidden)'}
                        </span>
                        <h4 className="text-xs sm:text-sm font-serif font-bold text-white leading-tight line-clamp-2">
                          {activeSlide.heading || 'AXDORO – Clothing Made for Every Occasion'}
                        </h4>
                        <p className="text-[10px] text-stone-300 line-clamp-2 leading-relaxed">
                          {activeSlide.subtitle || 'Quality Clothing. Comfortable Wear. Bulk Orders Made Simple.'}
                        </p>
                        <div className="pt-1.5">
                          <span className="inline-block px-2.5 py-1 text-[10px] font-semibold rounded bg-[#E5B842] text-black">
                            {activeSlide.ctaLabel || 'Explore Collection'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="absolute top-2 right-2">
                      {activeSlide.imageUrl ? (
                        <Badge variant="default" className="text-[10px] bg-axdoro-accent text-black font-semibold">
                          Custom Image
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] bg-black/60 text-stone-200 border-white/20">
                          Default Asset (/hero-bg.jpg)
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Image Controls under preview */}
                  <div className="p-3 rounded-lg border border-axdoro-border bg-axdoro-surface-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-axdoro-charcoal">Slide Image</span>
                      <div className="flex items-center gap-2">
                        {activeSlide.imageUrl && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleResetSlotImageToDefault(activeSlide.id)}
                            disabled={isSavingHero}
                            className="h-7 text-[11px] text-red-500 hover:text-red-600 hover:border-red-300"
                          >
                            Remove Image
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleOpenHeroModalForSlot(activeSlide.id)}
                          disabled={isSavingHero}
                          className="h-7 text-[11px] font-semibold"
                        >
                          <Upload className="w-3 h-3 mr-1" />
                          {activeSlide.imageUrl ? 'Replace' : 'Upload'}
                        </Button>
                      </div>
                    </div>
                    {activeSlide.imageUrl ? (
                      <p className="font-mono text-[10px] text-axdoro-text-muted truncate">
                        {activeSlide.imageUrl}
                      </p>
                    ) : (
                      <p className="text-[11px] text-axdoro-text-muted leading-relaxed">
                        Uses default storefront fallback asset (<code className="text-[10px] font-mono">/hero-bg.jpg</code>).
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Column (7 cols): Editorial & Behavior Form */}
                <div className="lg:col-span-7 space-y-4">
                  {/* Enabled / Disabled Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-axdoro-border bg-axdoro-surface">
                    <div>
                      <label htmlFor="slide-enabled-toggle" className="text-xs font-semibold text-axdoro-charcoal cursor-pointer">
                        Enable Slide on Storefront
                      </label>
                      <p className="text-[11px] text-axdoro-text-muted">
                        When disabled, the carousel automatically skips this slide slot.
                      </p>
                    </div>
                    <input
                      id="slide-enabled-toggle"
                      type="checkbox"
                      checked={activeSlide.isEnabled}
                      onChange={(e) => handleActiveSlideChange('isEnabled', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-axdoro-purple focus:ring-axdoro-purple cursor-pointer"
                    />
                  </div>

                  {/* Heading */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="slide-heading" className="text-xs font-semibold text-axdoro-charcoal">
                        Slide Heading *
                      </Label>
                      <span className="text-[10px] font-mono text-axdoro-text-muted">
                        {activeSlide.heading.length} / 200
                      </span>
                    </div>
                    <Input
                      id="slide-heading"
                      type="text"
                      value={activeSlide.heading}
                      maxLength={200}
                      onChange={(e) => handleActiveSlideChange('heading', e.target.value)}
                      placeholder="e.g. AXDORO – Clothing Made for Every Occasion"
                      className="text-xs"
                    />
                  </div>

                  {/* Subtitle */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="slide-subtitle" className="text-xs font-semibold text-axdoro-charcoal">
                        Slide Subtitle / Description *
                      </Label>
                      <span className="text-[10px] font-mono text-axdoro-text-muted">
                        {activeSlide.subtitle.length} / 300
                      </span>
                    </div>
                    <textarea
                      id="slide-subtitle"
                      value={activeSlide.subtitle}
                      maxLength={300}
                      rows={2}
                      onChange={(e) => handleActiveSlideChange('subtitle', e.target.value)}
                      placeholder="e.g. Quality Clothing. Comfortable Wear. Bulk Orders Made Simple."
                      className="w-full text-xs rounded-md border border-axdoro-border bg-transparent p-2 focus:outline-none focus:ring-1 focus:ring-axdoro-purple"
                    />
                  </div>

                  {/* CTA Label & Destination Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="slide-cta-label" className="text-xs font-semibold text-axdoro-charcoal">
                          CTA Button Label *
                        </Label>
                        <span className="text-[10px] font-mono text-axdoro-text-muted">
                          {activeSlide.ctaLabel.length} / 50
                        </span>
                      </div>
                      <Input
                        id="slide-cta-label"
                        type="text"
                        value={activeSlide.ctaLabel}
                        maxLength={50}
                        onChange={(e) => handleActiveSlideChange('ctaLabel', e.target.value)}
                        placeholder="e.g. Explore Collection"
                        className="text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="slide-cta-link" className="text-xs font-semibold text-axdoro-charcoal">
                          CTA Destination *
                        </Label>
                        {ctaCheck.valid ? (
                          <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Valid
                          </span>
                        ) : (
                          <span className="text-[10px] text-red-500 font-medium">Invalid</span>
                        )}
                      </div>
                      <Input
                        id="slide-cta-link"
                        type="text"
                        value={activeSlide.ctaLink}
                        onChange={(e) => handleActiveSlideChange('ctaLink', e.target.value)}
                        placeholder="e.g. #collection-tabs, /category/formal, bulk"
                        className={`text-xs ${!ctaCheck.valid ? 'border-red-400 focus:ring-red-400' : ''}`}
                      />
                      <p className="text-[10px] text-axdoro-text-muted">
                        Allowed: <code className="font-mono text-axdoro-charcoal">/path</code>, <code className="font-mono text-axdoro-charcoal">#anchor</code>, or action <code className="font-mono text-axdoro-charcoal">bulk</code> / <code className="font-mono text-axdoro-charcoal">explore</code>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

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
      {/* Hero Image Modal Dialog */}
      {isHeroModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-lg border-axdoro-border bg-axdoro-surface text-axdoro-charcoal shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-axdoro-border">
              <div>
                <CardTitle className="text-base font-bold text-axdoro-charcoal flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-axdoro-accent" />
                  Manage Homepage Hero Image
                </CardTitle>
                <CardDescription className="text-xs text-axdoro-text-muted mt-0.5">
                  Upload a high-resolution banner via Cloudinary or enter an image URL for Slot {editingModalSlideId}.
                </CardDescription>
              </div>
              <button
                type="button"
                onClick={handleCloseHeroModal}
                disabled={isSavingHero}
                className="p-1 rounded-md text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              {heroModalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <span>{heroModalError}</span>
                </div>
              )}

              {/* Live Preview Container */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-axdoro-charcoal">Live Banner Preview</Label>
                <div className="relative w-full h-44 rounded-lg overflow-hidden border border-axdoro-border bg-black/60 flex items-center justify-center">
                  <img
                    src={heroPreviewUrl || heroSlides.find((s) => s.id === editingModalSlideId)?.imageUrl || '/hero-bg.jpg'}
                    alt="Hero Preview"
                    className="w-full h-full object-cover object-[75%_center]"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.endsWith('/hero-bg.jpg')) {
                        target.src = '/hero-bg.jpg';
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-3 left-4 pointer-events-none text-left">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#E5B842] font-bold">Preview</span>
                    <p className="text-xs font-bold text-white leading-tight">Headline Contrast Overlay Simulation</p>
                  </div>
                </div>
              </div>

              {/* Mode Toggle: File Upload vs Direct URL */}
              <div className="flex items-center gap-2 border-b border-axdoro-border pb-2 pt-1">
                <button
                  type="button"
                  onClick={() => setUseHeroManualUrl(false)}
                  className={`text-xs font-semibold pb-1.5 px-2 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                    !useHeroManualUrl
                      ? 'border-axdoro-accent text-axdoro-accent'
                      : 'border-transparent text-axdoro-text-muted hover:text-axdoro-charcoal'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" /> File Upload (Cloudinary)
                </button>
                <button
                  type="button"
                  onClick={() => setUseHeroManualUrl(true)}
                  className={`text-xs font-semibold pb-1.5 px-2 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                    useHeroManualUrl
                      ? 'border-axdoro-accent text-axdoro-accent'
                      : 'border-transparent text-axdoro-text-muted hover:text-axdoro-charcoal'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" /> Direct URL
                </button>
              </div>

              {!useHeroManualUrl ? (
                /* Cloudinary File Upload Mode */
                <div className="space-y-2">
                  <input
                    ref={heroFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={handleHeroFileChange}
                    className="hidden"
                    id="hero-file-upload-input"
                  />
                  <label
                    htmlFor="hero-file-upload-input"
                    className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-axdoro-border rounded-lg bg-axdoro-surface-muted/40 hover:bg-axdoro-surface-muted/80 hover:border-axdoro-accent/50 transition-colors cursor-pointer text-center"
                  >
                    <Upload className="w-8 h-8 text-axdoro-text-muted/60 mb-2" />
                    <span className="text-xs font-semibold text-axdoro-charcoal">
                      {heroFile ? heroFile.name : 'Click to select banner image'}
                    </span>
                    <span className="text-[11px] text-axdoro-text-muted mt-1">
                      JPEG, PNG, WebP or AVIF up to 10MB
                    </span>
                  </label>
                  {heroFile && (
                    <div className="flex items-center justify-between text-xs px-2 text-axdoro-accent">
                      <span>Selected: {heroFile.name} ({(heroFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                      <button
                        type="button"
                        onClick={handleClearHeroSelectedFile}
                        className="text-red-400 hover:text-red-300 font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Direct URL Mode */
                <div className="space-y-2">
                  <Label htmlFor="hero-manual-url" className="text-xs font-semibold text-axdoro-charcoal">
                    Image Web Address (HTTPS)
                  </Label>
                  <Input
                    id="hero-manual-url"
                    type="url"
                    value={heroManualUrl}
                    onChange={(e) => {
                      setHeroManualUrl(e.target.value);
                      setHeroPreviewUrl(e.target.value);
                      setHeroModalError(null);
                    }}
                    placeholder="https://images.unsplash.com/... or https://res.cloudinary.com/..."
                    className="text-xs"
                  />
                  <p className="text-[11px] text-axdoro-text-muted">
                    Must begin with http:// or https:// and link directly to an image asset.
                  </p>
                </div>
              )}
            </CardContent>

            <div className="p-4 border-t border-axdoro-border flex items-center justify-between">
              {heroSlides.find((s) => s.id === editingModalSlideId)?.imageUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await handleResetSlotImageToDefault(editingModalSlideId);
                    setIsHeroModalOpen(false);
                  }}
                  disabled={isSavingHero}
                  className="text-xs text-red-400 hover:text-red-300 hover:border-red-400/40"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset to Default
                </Button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseHeroModal}
                  disabled={isSavingHero}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveHero}
                  disabled={isSavingHero || (!heroFile && (!heroManualUrl.trim() || heroManualUrl.trim() === heroSlides.find((s) => s.id === editingModalSlideId)?.imageUrl))}
                  className="text-xs font-semibold flex items-center gap-1.5"
                >
                  {isSavingHero ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Hero Image</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

