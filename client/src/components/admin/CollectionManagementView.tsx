import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Image as ImageIcon,
  Upload,
  Link as LinkIcon,
  RotateCcw,
  Sliders,
  Eye,
  EyeOff,
  FolderTree,
  Monitor,
  Tablet,
  Smartphone,
} from 'lucide-react';
import {
  adminGetHomepageHero,
  adminGetHeroUploadSignature,
  adminUpdateHomepageHero,
  adminGetCategories,
  AdminCategory,
} from '../../api/admin.ts';
import {
  DEFAULT_CATEGORY_IMAGES,
  GENERIC_CATEGORY_IMAGE,
} from '../Hero.tsx';
import { useScrollLock } from '../../utils/scrollLock.ts';
import {
  HeroSlide,
  HomepageHeroSetting,
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
      imagePosition: 50,
      imagePositionX: 50,
    },
    {
      id: 2,
      imageUrl: null,
      heading: 'Tailored Elegance for Work & Celebrations',
      subtitle: 'Refined formalwear and versatile essentials designed with premium breathable cotton and modern silhouettes.',
      ctaLabel: 'Shop Formals',
      ctaLink: '/category/formal',
      isEnabled: true,
      imagePosition: 50,
      imagePositionX: 50,
    },
    {
      id: 3,
      imageUrl: null,
      heading: 'Seamless Custom Bulk Orders & Uniforms',
      subtitle: 'Elevate your team with personalized fits, high-durability fabrics, and dedicated bulk pricing.',
      ctaLabel: 'Enquire for Bulk Orders',
      ctaLink: 'bulk',
      isEnabled: true,
      imagePosition: 50,
      imagePositionX: 50,
    },
  ];


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
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  // Marquee state
  const [isCategoryMarqueeEnabled, setIsCategoryMarqueeEnabled] = useState<boolean>(true);
  const [marqueeCategoryImages, setMarqueeCategoryImages] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState<boolean>(true);
  const [isSavingMarquee, setIsSavingMarquee] = useState<boolean>(false);
  const [marqueeError, setMarqueeError] = useState<string | null>(null);
  const [marqueeSuccessMessage, setMarqueeSuccessMessage] = useState<string | null>(null);

  // Marquee modal state
  const [isMarqueeModalOpen, setIsMarqueeModalOpen] = useState<boolean>(false);
  const [editingMarqueeCategory, setEditingMarqueeCategory] = useState<AdminCategory | null>(null);
  const [marqueeFile, setMarqueeFile] = useState<File | null>(null);
  const [marqueePreviewUrl, setMarqueePreviewUrl] = useState<string | null>(null);
  const [marqueeManualUrl, setMarqueeManualUrl] = useState<string>('');
  const [useMarqueeManualUrl, setUseMarqueeManualUrl] = useState<boolean>(false);
  const [isSavingMarqueeModal, setIsSavingMarqueeModal] = useState<boolean>(false);
  const [marqueeModalError, setMarqueeModalError] = useState<string | null>(null);
  const marqueeFileInputRef = useRef<HTMLInputElement>(null);

  // Global reference-counted scroll lock for hero image and marquee modal
  useScrollLock(isHeroModalOpen);
  useScrollLock(isMarqueeModalOpen);

  const loadHero = useCallback(async () => {
    try {
      setIsLoadingHero(true);
      setIsLoadingCategories(true);
      setHeroError(null);
      setMarqueeError(null);

      const [hero, catList] = await Promise.all([
        adminGetHomepageHero(),
        adminGetCategories().catch((e) => {
          console.warn('[CollectionManagementView] Failed to load categories for marquee:', e);
          return [] as AdminCategory[];
        }),
      ]);

      setHeroSetting(hero);
      setIsCategoryMarqueeEnabled(hero.isCategoryMarqueeEnabled ?? true);
      setMarqueeCategoryImages(hero.marqueeCategoryImages ?? {});

      const activeCats = (catList || [])
        .filter((c) => c && c.isActive)
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      setCategories(activeCats);

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
      setIsLoadingCategories(false);
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
      if (marqueePreviewUrl && marqueePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(marqueePreviewUrl);
      }
    };
  }, [heroPreviewUrl, marqueePreviewUrl]);

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

  const handleSlidePositionChange = (slotId: number, axis: 'x' | 'y', position: number) => {
    // Instant live preview in local state
    setHeroSlides((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, [axis === 'x' ? 'imagePositionX' : 'imagePosition']: position }
          : s
      )
    );
  };

  const handleCommitSlidePosition = async (
    slotId: number,
    customAxis?: 'x' | 'y',
    customPos?: number
  ) => {
    try {
      setIsSavingHero(true);
      setHeroError(null);
      const targetSlide = heroSlides.find((s) => s.id === slotId);
      const posX =
        customAxis === 'x' && customPos !== undefined
          ? customPos
          : (targetSlide?.imagePositionX ?? 50);
      const posY =
        customAxis === 'y' && customPos !== undefined
          ? customPos
          : (targetSlide?.imagePosition ?? 50);

      const updatedSlides = heroSlides.map((s) =>
        s.id === slotId ? { ...s, imagePositionX: posX, imagePosition: posY } : s
      );

      const updated = await adminUpdateHomepageHero({
        slides: updatedSlides,
      });

      setHeroSetting(updated);
      if (updated.slides) {
        setHeroSlides(updated.slides);
      }
      setHeroSuccessMessage(`Slide ${slotId} focal point saved (X: ${posX}%, Y: ${posY}%).`);
      onCollectionMutated?.();
    } catch (err) {
      setHeroError(err instanceof Error ? err.message : 'Failed to save slide focal point');
    } finally {
      setIsSavingHero(false);
    }
  };

  const handleSetSlidePosition = async (slotId: number, axis: 'x' | 'y', position: number) => {
    handleSlidePositionChange(slotId, axis, position);
    await handleCommitSlidePosition(slotId, axis, position);
  };

  const handleSaveAllSlides = async () => {
    try {
      setIsSavingHero(true);
      setHeroError(null);
      setHeroSuccessMessage(null);

      // Sanitize slide metadata with standard fallbacks so the server contract is preserved
      const sanitizedSlides = heroSlides.map((slide, idx) => {
        const fallback = DEFAULT_HERO_SLIDES[idx] || DEFAULT_HERO_SLIDES[0];
        return {
          ...slide,
          heading: slide.heading?.trim() || fallback.heading,
          subtitle: slide.subtitle?.trim() || fallback.subtitle,
          ctaLabel: slide.ctaLabel?.trim() || fallback.ctaLabel,
          ctaLink: slide.ctaLink?.trim() || fallback.ctaLink,
          isEnabled: true,
          imagePosition: typeof slide.imagePosition === 'number' ? slide.imagePosition : 50,
          imagePositionX: typeof slide.imagePositionX === 'number' ? slide.imagePositionX : 50,
        };
      });

      const updated = await adminUpdateHomepageHero({
        slides: sanitizedSlides,
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

  const handleToggleMarqueeEnabled = async (enabled: boolean) => {
    try {
      setIsSavingMarquee(true);
      setMarqueeError(null);
      setMarqueeSuccessMessage(null);

      const updated = await adminUpdateHomepageHero({
        isCategoryMarqueeEnabled: enabled,
      });

      setIsCategoryMarqueeEnabled(updated.isCategoryMarqueeEnabled ?? enabled);
      setMarqueeSuccessMessage(
        enabled
          ? 'Top category marquee enabled on storefront.'
          : 'Top category marquee disabled on storefront.'
      );
      onCollectionMutated?.();
    } catch (err) {
      setMarqueeError(err instanceof Error ? err.message : 'Failed to update marquee status');
    } finally {
      setIsSavingMarquee(false);
    }
  };

  const handleResetCategoryMarqueeImage = async (categorySlug: string) => {
    try {
      setIsSavingMarquee(true);
      setMarqueeError(null);
      setMarqueeSuccessMessage(null);

      const updatedImages = { ...marqueeCategoryImages, [categorySlug]: null };
      const updated = await adminUpdateHomepageHero({
        marqueeCategoryImages: updatedImages,
      });

      setMarqueeCategoryImages(updated.marqueeCategoryImages ?? {});
      setMarqueeSuccessMessage(`Reset marquee image for "${categorySlug}" to default 3D asset.`);
      onCollectionMutated?.();
    } catch (err) {
      setMarqueeError(err instanceof Error ? err.message : 'Failed to reset marquee image');
    } finally {
      setIsSavingMarquee(false);
    }
  };

  const handleOpenMarqueeModal = (category: AdminCategory) => {
    setEditingMarqueeCategory(category);
    const existingCustom =
      marqueeCategoryImages[category.slug] || (category.id ? marqueeCategoryImages[category.id] : '');
    setMarqueeFile(null);
    setMarqueePreviewUrl(existingCustom || null);
    setMarqueeManualUrl(existingCustom || '');
    setUseMarqueeManualUrl(false);
    setMarqueeModalError(null);
    setIsMarqueeModalOpen(true);
  };

  const handleCloseMarqueeModal = () => {
    if (marqueePreviewUrl && marqueePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(marqueePreviewUrl);
    }
    setMarqueeFile(null);
    setMarqueePreviewUrl(null);
    setMarqueeManualUrl('');
    setMarqueeModalError(null);
    setEditingMarqueeCategory(null);
    setIsMarqueeModalOpen(false);
  };

  const handleMarqueeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (marqueePreviewUrl && marqueePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(marqueePreviewUrl);
      }
      setMarqueeFile(file);
      setMarqueePreviewUrl(URL.createObjectURL(file));
      setMarqueeModalError(null);
    }
  };

  const handleClearMarqueeSelectedFile = () => {
    if (marqueePreviewUrl && marqueePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(marqueePreviewUrl);
    }
    setMarqueeFile(null);
    const existingCustom = editingMarqueeCategory
      ? marqueeCategoryImages[editingMarqueeCategory.slug] || ''
      : '';
    setMarqueePreviewUrl(existingCustom || null);
    if (marqueeFileInputRef.current) {
      marqueeFileInputRef.current.value = '';
    }
  };

  const handleSaveCategoryMarqueeImage = async () => {
    if (!editingMarqueeCategory) return;
    try {
      setIsSavingMarqueeModal(true);
      setMarqueeModalError(null);

      let finalImageUrl: string | null = null;
      if (useMarqueeManualUrl) {
        if (!marqueeManualUrl.trim()) {
          setMarqueeModalError('Please enter an image URL or choose a file.');
          setIsSavingMarqueeModal(false);
          return;
        }
        finalImageUrl = marqueeManualUrl.trim();
      } else if (marqueeFile) {
        const sig = await adminGetHeroUploadSignature();
        const formData = new FormData();
        formData.append('file', marqueeFile);
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

        const uploadJson = await uploadRes.json();
        finalImageUrl = uploadJson.secure_url || uploadJson.url;
      } else if (marqueePreviewUrl) {
        finalImageUrl = marqueePreviewUrl;
      }

      if (!finalImageUrl) {
        setMarqueeModalError('Please choose a file or enter an image URL.');
        setIsSavingMarqueeModal(false);
        return;
      }

      const updated = await adminUpdateHomepageHero({
        marqueeCategoryImages: {
          [editingMarqueeCategory.slug]: finalImageUrl,
        },
      });

      setMarqueeCategoryImages(updated.marqueeCategoryImages ?? {});
      setMarqueeSuccessMessage(`Custom marquee image saved for "${editingMarqueeCategory.name}".`);
      handleCloseMarqueeModal();
      onCollectionMutated?.();
    } catch (err) {
      setMarqueeModalError(err instanceof Error ? err.message : 'Failed to save marquee image');
    } finally {
      setIsSavingMarqueeModal(false);
    }
  };

  if (isLoadingHero) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-axdoro-purple" />
        <p className="text-sm text-axdoro-muted">Loading storefront hero settings...</p>
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
            Manage your storefront hero lifestyle banner and slides.
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
                  <span className="ml-2 font-mono text-[10px] text-axdoro-accent-muted block sm:inline mt-0.5 sm:mt-0">
                    (Last saved: {new Date(heroSetting.updatedAt).toLocaleTimeString()})
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetHeroToDefault}
                disabled={isSavingHero || !heroSlides.find((s) => s.id === activeSlideId)?.imageUrl}
                className="h-8 text-xs font-semibold text-axdoro-text-muted hover:text-red-400 hover:border-red-400/40 flex-1 sm:flex-initial"
                title="Reset to default /hero-bg.jpg"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset to Default
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleOpenHeroModal}
                disabled={isLoadingHero}
                className="h-8 text-xs font-semibold px-3 shadow-xs flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{heroSlides.find((s) => s.id === activeSlideId)?.imageUrl ? 'Change Hero Image' : 'Upload Hero Image'}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveAllSlides}
                disabled={isSavingHero || isLoadingHero}
                className="h-8 text-xs font-semibold px-3.5 bg-axdoro-purple text-white hover:bg-axdoro-purple-light flex items-center justify-center gap-1.5 w-full sm:w-auto"
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
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
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
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 mt-0.5" />
            <div className="flex-1 font-medium">{heroSuccessMessage}</div>
            <button onClick={() => setHeroSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Slide Slot Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-axdoro-border px-4 sm:px-6 pt-3 pb-2 overflow-x-auto scrollbar-thin">
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
                    slide.imageUrl
                      ? isSelected
                        ? 'bg-amber-300 text-black font-semibold'
                        : 'bg-amber-100 text-amber-800'
                      : isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  {slide.imageUrl ? 'Custom' : 'Default'}
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

            return (
              <div className="space-y-4 max-w-4xl mx-auto">
                {/* Banner Preview with Responsive Viewport Controls */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-axdoro-charcoal">Live Responsive Preview</span>
                        <span className="text-[11px] font-mono text-axdoro-text-muted">Slide Slot {activeSlide.id}</span>
                      </div>
                      <p className="text-[11px] text-axdoro-text-muted mt-0.5">
                        Simulate exact frontend cropping and proportions across devices.
                      </p>
                    </div>

                    {/* Viewport Selector: Desktop, Tablet, Mobile */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-axdoro-border self-start sm:self-auto shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('desktop')}
                        aria-pressed={previewDevice === 'desktop'}
                        className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          previewDevice === 'desktop'
                            ? 'bg-axdoro-charcoal text-white shadow-xs'
                            : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                        }`}
                        title="Desktop (1280px wide / ~2.54:1 aspect ratio)"
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        <span>Desktop</span>
                        <span className="text-[10px] opacity-75 font-mono hidden md:inline">(1280px)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('tablet')}
                        aria-pressed={previewDevice === 'tablet'}
                        className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          previewDevice === 'tablet'
                            ? 'bg-axdoro-charcoal text-white shadow-xs'
                            : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                        }`}
                        title="Tablet (768px wide / ~1.66:1 aspect ratio)"
                      >
                        <Tablet className="w-3.5 h-3.5" />
                        <span>Tablet</span>
                        <span className="text-[10px] opacity-75 font-mono hidden md:inline">(768px)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('mobile')}
                        aria-pressed={previewDevice === 'mobile'}
                        className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          previewDevice === 'mobile'
                            ? 'bg-axdoro-charcoal text-white shadow-xs'
                            : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                        }`}
                        title="Mobile (375px wide / ~1.12:1 aspect ratio)"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Mobile</span>
                        <span className="text-[10px] opacity-75 font-mono hidden md:inline">(375px)</span>
                      </button>
                    </div>
                  </div>

                  {/* Device Simulation Frame matching frontend hero proportions */}
                  <div className="w-full bg-neutral-100/70 p-3 sm:p-5 rounded-xl border border-dashed border-neutral-300 flex flex-col items-center justify-center min-h-[260px] transition-all">
                    <div
                      className={`relative rounded-xl overflow-hidden border border-axdoro-border bg-axdoro-bg shadow-sm transition-all duration-300 ${
                        previewDevice === 'desktop'
                          ? 'w-full aspect-[1280/504] max-h-72'
                          : previewDevice === 'tablet'
                          ? 'w-[440px] max-w-full aspect-[768/462]'
                          : 'w-[270px] max-w-full aspect-[375/456]'
                      }`}
                    >
                      <img
                        src={activeSlide.imageUrl || '/hero-bg.jpg'}
                        alt={`Slide ${activeSlide.id} Preview`}
                        style={{
                          objectPosition: `${activeSlide.imagePositionX ?? 50}% ${activeSlide.imagePosition ?? 50}%`,
                        }}
                        className="w-full h-full object-cover transition-[object-position] duration-150"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (!target.src.endsWith('/hero-bg.jpg')) {
                            target.src = '/hero-bg.jpg';
                          }
                        }}
                      />
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-2">
                        {activeSlide.imageUrl ? (
                          <Badge variant="default" className="text-[10px] bg-axdoro-accent text-black font-semibold shadow-xs">
                            Custom Image
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] bg-black/70 text-white border-white/20 shadow-xs">
                            Default Asset
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] font-mono bg-black/60 text-white border-white/20 backdrop-blur-sm">
                          {previewDevice === 'desktop'
                            ? 'Desktop (~2.54:1)'
                            : previewDevice === 'tablet'
                            ? 'Tablet (~1.66:1)'
                            : 'Mobile (~0.82:1)'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2D Focal Framing Controls (Horizontal X + Vertical Y) */}
                <div className="p-4 sm:p-5 rounded-xl border border-axdoro-border bg-axdoro-surface-muted/30 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-axdoro-border/60 pb-3">
                    <div>
                      <span className="text-xs font-bold text-axdoro-charcoal flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-axdoro-accent" />
                        <span>Responsive Image Focal Point Positioning</span>
                      </span>
                      <p className="text-[11px] text-axdoro-text-muted mt-0.5">
                        Adjust framing coordinates so clothing models and products remain centered on every screen size.
                      </p>
                    </div>
                    <div className="self-start sm:self-auto">
                      <span className="text-[11px] font-mono font-bold text-axdoro-charcoal bg-white px-2.5 py-1 rounded-md border border-neutral-200">
                        Focal Point: X: {activeSlide.imagePositionX ?? 50}%, Y: {activeSlide.imagePosition ?? 50}%
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Focal Alignment (X-Axis) */}
                  <div className="space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <Label className="text-xs font-semibold text-axdoro-charcoal flex flex-wrap items-center gap-1">
                        <span>Horizontal Alignment (X-Axis)</span>
                        <span className="text-[10px] font-normal text-axdoro-text-muted">— centers models on mobile/tablet viewports</span>
                      </Label>

                      {/* Presets: Left (0%), Center (50%), Right (100%) */}
                      <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-axdoro-border w-full sm:w-auto justify-between sm:justify-start">
                        <button
                          type="button"
                          onClick={() => handleSetSlidePosition(activeSlide.id, 'x', 0)}
                          disabled={isSavingHero}
                          className={`flex-1 sm:flex-initial px-2 py-0.5 text-[11px] font-semibold rounded transition-colors cursor-pointer text-center ${
                            (activeSlide.imagePositionX ?? 50) === 0
                              ? 'bg-axdoro-charcoal text-white shadow-xs'
                              : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                          }`}
                        >
                          Left (0%)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetSlidePosition(activeSlide.id, 'x', 50)}
                          disabled={isSavingHero}
                          className={`flex-1 sm:flex-initial px-2 py-0.5 text-[11px] font-semibold rounded transition-colors cursor-pointer text-center ${
                            (activeSlide.imagePositionX ?? 50) === 50
                              ? 'bg-axdoro-charcoal text-white shadow-xs'
                              : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                          }`}
                        >
                          Center (50%)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetSlidePosition(activeSlide.id, 'x', 100)}
                          disabled={isSavingHero}
                          className={`flex-1 sm:flex-initial px-2 py-0.5 text-[11px] font-semibold rounded transition-colors cursor-pointer text-center ${
                            (activeSlide.imagePositionX ?? 50) === 100
                              ? 'bg-axdoro-charcoal text-white shadow-xs'
                              : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                          }`}
                        >
                          Right (100%)
                        </button>
                      </div>
                    </div>

                    {/* Horizontal Range Slider */}
                    <div className="flex items-center gap-2 sm:gap-3 pt-0.5">
                      <span className="text-[10px] sm:text-[11px] font-mono text-axdoro-text-muted flex-shrink-0">
                        0% <span className="hidden sm:inline">(Left)</span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={activeSlide.imagePositionX ?? 50}
                        onChange={(e) => handleSlidePositionChange(activeSlide.id, 'x', Number(e.target.value))}
                        onPointerUp={() => handleCommitSlidePosition(activeSlide.id, 'x')}
                        disabled={isSavingHero}
                        className="flex-1 min-w-[100px] h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-axdoro-charcoal"
                        aria-label="Slide horizontal alignment position"
                      />
                      <span className="text-[10px] sm:text-[11px] font-mono text-axdoro-text-muted text-right flex-shrink-0">
                        100% <span className="hidden sm:inline">(Right)</span>
                      </span>
                      <span className="text-xs font-mono font-bold text-axdoro-charcoal bg-white px-1.5 sm:px-2 py-0.5 rounded border border-neutral-200 min-w-10 sm:min-w-12 text-center flex-shrink-0">
                        {activeSlide.imagePositionX ?? 50}%
                      </span>
                    </div>
                  </div>

                  {/* Vertical Image Alignment (Y-Axis) */}
                  <div className="space-y-2.5 pt-1 border-t border-axdoro-border/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <Label className="text-xs font-semibold text-axdoro-charcoal flex flex-wrap items-center gap-1">
                        <span>Vertical Alignment (Y-Axis)</span>
                        <span className="text-[10px] font-normal text-axdoro-text-muted">— preserves headroom or garment hemline</span>
                      </Label>

                      {/* Presets: Top (0%), Center (50%), Bottom (100%) */}
                      <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-axdoro-border w-full sm:w-auto justify-between sm:justify-start">
                        <button
                          type="button"
                          onClick={() => handleSetSlidePosition(activeSlide.id, 'y', 0)}
                          disabled={isSavingHero}
                          className={`flex-1 sm:flex-initial px-2 py-0.5 text-[11px] font-semibold rounded transition-colors cursor-pointer text-center ${
                            (activeSlide.imagePosition ?? 50) === 0
                              ? 'bg-axdoro-charcoal text-white shadow-xs'
                              : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                          }`}
                        >
                          Top (0%)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetSlidePosition(activeSlide.id, 'y', 50)}
                          disabled={isSavingHero}
                          className={`flex-1 sm:flex-initial px-2 py-0.5 text-[11px] font-semibold rounded transition-colors cursor-pointer text-center ${
                            (activeSlide.imagePosition ?? 50) === 50
                              ? 'bg-axdoro-charcoal text-white shadow-xs'
                              : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                          }`}
                        >
                          Center (50%)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetSlidePosition(activeSlide.id, 'y', 100)}
                          disabled={isSavingHero}
                          className={`flex-1 sm:flex-initial px-2 py-0.5 text-[11px] font-semibold rounded transition-colors cursor-pointer text-center ${
                            (activeSlide.imagePosition ?? 50) === 100
                              ? 'bg-axdoro-charcoal text-white shadow-xs'
                              : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                          }`}
                        >
                          Bottom (100%)
                        </button>
                      </div>
                    </div>

                    {/* Vertical Range Slider */}
                    <div className="flex items-center gap-2 sm:gap-3 pt-0.5">
                      <span className="text-[10px] sm:text-[11px] font-mono text-axdoro-text-muted flex-shrink-0">
                        0% <span className="hidden sm:inline">(Top)</span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={activeSlide.imagePosition ?? 50}
                        onChange={(e) => handleSlidePositionChange(activeSlide.id, 'y', Number(e.target.value))}
                        onPointerUp={() => handleCommitSlidePosition(activeSlide.id, 'y')}
                        disabled={isSavingHero}
                        className="flex-1 min-w-[100px] h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-axdoro-charcoal"
                        aria-label="Slide vertical alignment position"
                      />
                      <span className="text-[10px] sm:text-[11px] font-mono text-axdoro-text-muted text-right flex-shrink-0">
                        100% <span className="hidden sm:inline">(Btm)</span>
                      </span>
                      <span className="text-xs font-mono font-bold text-axdoro-charcoal bg-white px-1.5 sm:px-2 py-0.5 rounded border border-neutral-200 min-w-10 sm:min-w-12 text-center flex-shrink-0">
                        {activeSlide.imagePosition ?? 50}%
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-axdoro-text-muted leading-relaxed bg-white/70 p-2.5 rounded-lg border border-neutral-200">
                    <strong>Responsive Design Note:</strong> The hero uses <code className="text-[10px] font-mono bg-neutral-100 px-1 py-0.5 rounded">object-fit: cover</code> to ensure crisp, non-distorted rendering without letterbox gaps. Because mobile screens are tall (~1.12:1) while desktops are wide (~2.54:1), edge cropping is unavoidable. Use the focal sliders and device toggle tabs above to position the most critical clothing and model elements in view.
                  </p>
                </div>

                {/* Image Controls Bar */}
                <div className="p-4 rounded-xl border border-axdoro-border bg-axdoro-surface-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-axdoro-charcoal block">Slide {activeSlide.id} Image</span>
                    {activeSlide.imageUrl ? (
                      <p className="font-mono text-xs text-axdoro-text-muted truncate mt-0.5">
                        {activeSlide.imageUrl}
                      </p>
                    ) : (
                      <p className="text-xs text-axdoro-text-muted leading-relaxed mt-0.5">
                        Uses storefront default lifestyle banner (<code className="text-[11px] font-mono">/hero-bg.jpg</code>).
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
                    {activeSlide.imageUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetSlotImageToDefault(activeSlide.id)}
                        disabled={isSavingHero}
                        className="h-8 text-xs text-red-500 hover:text-red-600 hover:border-red-300 flex-1 sm:flex-initial"
                      >
                        Remove Image
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleOpenHeroModalForSlot(activeSlide.id)}
                      disabled={isSavingHero}
                      className="h-8 text-xs font-semibold px-3.5 bg-axdoro-purple text-white hover:bg-axdoro-purple-light flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{activeSlide.imageUrl ? 'Replace Image' : 'Upload Image'}</span>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* 2. Top Category Marquee Strip Management Section */}
      <Card className="border-axdoro-border bg-axdoro-surface shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-axdoro-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-axdoro-charcoal flex items-center gap-2">
                <Sliders className="w-4 h-4 text-axdoro-accent" />
                Top Category Marquee Strip
              </CardTitle>
              <CardDescription className="text-xs text-axdoro-text-muted mt-0.5">
                Manage the continuous sliding 3D category marquee strip at the top of the storefront homepage.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <button
                type="button"
                role="switch"
                aria-checked={isCategoryMarqueeEnabled}
                aria-label="Toggle category marquee strip"
                disabled={isSavingMarquee || isLoadingCategories}
                onClick={() => handleToggleMarqueeEnabled(!isCategoryMarqueeEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent cursor-pointer ${
                  isCategoryMarqueeEnabled ? 'bg-axdoro-accent' : 'bg-neutral-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isCategoryMarqueeEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-xs font-semibold text-axdoro-charcoal min-w-28">
                {isCategoryMarqueeEnabled ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <Eye className="w-3.5 h-3.5" /> Marquee Enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-neutral-500">
                    <EyeOff className="w-3.5 h-3.5" /> Marquee Disabled
                  </span>
                )}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 pb-4 space-y-4">
          {marqueeSuccessMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-600 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{marqueeSuccessMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setMarqueeSuccessMessage(null)}
                className="text-emerald-600 hover:text-emerald-700 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {marqueeError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{marqueeError}</span>
              </div>
              <button
                type="button"
                onClick={() => setMarqueeError(null)}
                className="text-red-500 hover:text-red-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs text-axdoro-text-muted">
              Categories are dynamically populated from active catalogue items and sorted by their administrative <code className="font-mono text-[11px] bg-neutral-100 px-1 py-0.5 rounded">display_order</code>.
            </p>
            {isSavingMarquee && (
              <span className="inline-flex items-center gap-1.5 text-xs text-axdoro-accent flex-shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving settings...
              </span>
            )}
          </div>

          {isLoadingCategories ? (
            <div className="py-8 flex flex-col items-center justify-center text-axdoro-text-muted text-xs gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-axdoro-accent" />
              <span>Loading catalogue categories...</span>
            </div>
          ) : categories.length === 0 ? (
            <div className="py-6 text-center text-axdoro-text-muted text-xs border border-dashed border-axdoro-border rounded-lg p-4">
              <FolderTree className="w-6 h-6 mx-auto mb-2 text-axdoro-text-muted/60" />
              <p>No active categories found in the catalogue.</p>
              <p className="text-[11px] mt-1 text-axdoro-text-muted/80">
                Create and activate categories under the Categories section to display them here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 pt-1">
              {categories.map((cat) => {
                const customImg = marqueeCategoryImages[cat.slug] || (cat.id && marqueeCategoryImages[cat.id]);
                const default3d = DEFAULT_CATEGORY_IMAGES[cat.slug] || GENERIC_CATEGORY_IMAGE;
                const activeImg = customImg || default3d;
                const hasCustom = Boolean(customImg);

                return (
                  <div
                    key={cat.id || cat.slug}
                    className="p-3 sm:p-3.5 rounded-xl border border-axdoro-border bg-axdoro-surface-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-axdoro-border/80 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                      {/* Image Thumbnail Preview */}
                      <div className="relative w-14 h-14 rounded-lg bg-neutral-100/80 border border-neutral-200/80 flex items-center justify-center p-1.5 flex-shrink-0 overflow-hidden shadow-xs">
                        <img
                          src={activeImg}
                          alt={cat.name}
                          className="max-h-full max-w-full object-contain filter drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
                          onError={(e) => {
                            const target = e.currentTarget;
                            const fb = `/categories/${cat.slug}-3d.png`;
                            if (target.src !== fb && !target.src.endsWith(fb)) {
                              target.src = fb;
                            } else {
                              target.src = GENERIC_CATEGORY_IMAGE;
                            }
                          }}
                        />
                      </div>

                      {/* Category Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-axdoro-charcoal truncate">
                            {cat.name}
                          </span>
                          <span className="font-mono text-[10px] text-axdoro-text-muted bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                            #{cat.displayOrder ?? 0}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {hasCustom ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-medium bg-purple-50 text-axdoro-purple border-purple-200 px-1.5 py-0"
                            >
                              Custom Marquee Image
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-medium bg-neutral-50 text-neutral-600 border-neutral-200 px-1.5 py-0"
                            >
                              Default 3D Render
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1.5 flex-shrink-0 w-full sm:w-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-axdoro-border/40">
                      {hasCustom && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleResetCategoryMarqueeImage(cat.slug)}
                          disabled={isSavingMarquee}
                          className="h-7 text-xs text-neutral-600 hover:text-red-500 hover:border-red-300 px-2 cursor-pointer"
                          title="Revert to default 3D asset"
                        >
                          <RotateCcw className="w-3 h-3 mr-1" /> Default
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleOpenMarqueeModal(cat)}
                        disabled={isSavingMarquee}
                        className="h-7 text-xs font-medium px-2.5 bg-axdoro-surface border border-axdoro-border text-axdoro-charcoal hover:bg-neutral-100 flex items-center gap-1 cursor-pointer"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{hasCustom ? 'Replace' : 'Custom'}</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>


      {/* Hero Image Modal Dialog */}
      {isHeroModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
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
                    style={{
                      objectPosition: `${heroSlides.find((s) => s.id === editingModalSlideId)?.imagePositionX ?? 50}% ${heroSlides.find((s) => s.id === editingModalSlideId)?.imagePosition ?? 50}%`,
                    }}
                    className="w-full h-full object-cover transition-[object-position] duration-150"
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

            <div className="p-4 border-t border-axdoro-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
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
                  className="text-xs text-red-400 hover:text-red-300 hover:border-red-400/40 w-full sm:w-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset to Default
                </Button>
              )}
              <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseHeroModal}
                  disabled={isSavingHero}
                  className="text-xs flex-1 sm:flex-initial"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveHero}
                  disabled={isSavingHero || (!heroFile && (!heroManualUrl.trim() || heroManualUrl.trim() === heroSlides.find((s) => s.id === editingModalSlideId)?.imageUrl))}
                  className="text-xs font-semibold flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
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

      {/* Category Marquee Custom Image Modal Dialog */}
      {isMarqueeModalOpen && editingMarqueeCategory && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <Card className="w-full max-w-lg border-axdoro-border bg-axdoro-surface text-axdoro-charcoal shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-axdoro-border">
              <div>
                <CardTitle className="text-base font-bold text-axdoro-charcoal flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-axdoro-accent" />
                  Custom Marquee Image: {editingMarqueeCategory.name}
                </CardTitle>
                <CardDescription className="text-xs text-axdoro-text-muted mt-0.5">
                  Upload a transparent 3D asset/icon via Cloudinary or enter an image URL for the top marquee.
                </CardDescription>
              </div>
              <button
                type="button"
                onClick={handleCloseMarqueeModal}
                disabled={isSavingMarqueeModal}
                className="p-1 rounded-md text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              {marqueeModalError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{marqueeModalError}</span>
                </div>
              )}

              {/* Mode Toggle */}
              <div className="flex items-center gap-2 p-1 bg-axdoro-surface-muted rounded-lg border border-axdoro-border text-xs">
                <button
                  type="button"
                  onClick={() => setUseMarqueeManualUrl(false)}
                  className={`flex-1 py-1.5 px-3 rounded-md font-medium transition-all cursor-pointer ${
                    !useMarqueeManualUrl
                      ? 'bg-axdoro-surface text-axdoro-charcoal shadow-xs'
                      : 'text-axdoro-text-muted hover:text-axdoro-charcoal'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5 inline mr-1.5" />
                  File Upload
                </button>
                <button
                  type="button"
                  onClick={() => setUseMarqueeManualUrl(true)}
                  className={`flex-1 py-1.5 px-3 rounded-md font-medium transition-all cursor-pointer ${
                    useMarqueeManualUrl
                      ? 'bg-axdoro-surface text-axdoro-charcoal shadow-xs'
                      : 'text-axdoro-text-muted hover:text-axdoro-charcoal'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5 inline mr-1.5" />
                  Direct Image URL
                </button>
              </div>

              {!useMarqueeManualUrl ? (
                <div>
                  <input
                    ref={marqueeFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    onChange={handleMarqueeFileChange}
                    className="hidden"
                    id="marquee-file-input"
                  />
                  <div
                    onClick={() => marqueeFileInputRef.current?.click()}
                    className="border-2 border-dashed border-axdoro-border hover:border-axdoro-accent rounded-xl p-6 text-center cursor-pointer transition-colors bg-axdoro-surface-muted/30"
                  >
                    <Upload className="w-8 h-8 text-axdoro-accent mx-auto mb-2" />
                    <p className="text-xs font-semibold text-axdoro-charcoal">
                      {marqueeFile ? marqueeFile.name : 'Click to upload marquee 3D image'}
                    </p>
                    <p className="text-[11px] text-axdoro-text-muted mt-1">
                      PNG or WEBP with transparent background recommended (Max 5MB)
                    </p>
                  </div>
                  {marqueeFile && (
                    <div className="flex justify-end mt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClearMarqueeSelectedFile}
                        className="text-xs text-red-500 h-7 px-2 cursor-pointer"
                      >
                        Remove Selected File
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="marquee-url-input" className="text-xs font-medium text-axdoro-charcoal">
                    Image URL
                  </Label>
                  <Input
                    id="marquee-url-input"
                    type="url"
                    placeholder="https://... or /categories/..."
                    value={marqueeManualUrl}
                    onChange={(e) => {
                      setMarqueeManualUrl(e.target.value);
                      setMarqueePreviewUrl(e.target.value.trim() || null);
                    }}
                    className="h-9 text-xs"
                  />
                </div>
              )}

              {/* Live Preview */}
              {marqueePreviewUrl && (
                <div className="p-3 border border-axdoro-border rounded-xl bg-axdoro-surface-muted/20">
                  <span className="text-[11px] font-semibold text-axdoro-text-muted block mb-2">Live Preview:</span>
                  <div className="h-24 flex items-center justify-center p-2 rounded-lg bg-neutral-100 border border-neutral-200">
                    <img
                      src={marqueePreviewUrl}
                      alt="Marquee Preview"
                      className="max-h-full max-w-full object-contain filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.15)]"
                      onError={() => {
                        setMarqueeModalError('Preview failed to load. Please verify the URL or image file.');
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Dialog Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-axdoro-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseMarqueeModal}
                  disabled={isSavingMarqueeModal}
                  className="h-8 text-xs font-semibold cursor-pointer w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveCategoryMarqueeImage}
                  disabled={isSavingMarqueeModal}
                  className="h-8 text-xs font-semibold bg-axdoro-accent text-white hover:bg-axdoro-accent/90 flex items-center justify-center gap-1.5 cursor-pointer w-full sm:w-auto"
                >
                  {isSavingMarqueeModal ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Marquee Image</span>
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

