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
} from 'lucide-react';
import {
  adminGetHomepageHero,
  adminGetHeroUploadSignature,
  adminUpdateHomepageHero,
} from '../../api/admin.ts';
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

  const handleSlidePositionChange = (slotId: number, position: number) => {
    // Instant live preview in local state
    setHeroSlides((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, imagePosition: position } : s))
    );
  };

  const handleCommitSlidePosition = async (slotId: number, customPos?: number) => {
    try {
      setIsSavingHero(true);
      setHeroError(null);
      const targetSlide = heroSlides.find((s) => s.id === slotId);
      const position = customPos !== undefined ? customPos : (targetSlide?.imagePosition ?? 50);

      const updatedSlides = heroSlides.map((s) =>
        s.id === slotId ? { ...s, imagePosition: position } : s
      );

      const updated = await adminUpdateHomepageHero({
        slides: updatedSlides,
      });

      setHeroSetting(updated);
      if (updated.slides) {
        setHeroSlides(updated.slides);
      }
      setHeroSuccessMessage(`Slide ${slotId} alignment saved (${position}%).`);
      onCollectionMutated?.();
    } catch (err) {
      setHeroError(err instanceof Error ? err.message : 'Failed to save slide alignment');
    } finally {
      setIsSavingHero(false);
    }
  };

  const handleSetSlidePosition = async (slotId: number, position: number) => {
    handleSlidePositionChange(slotId, position);
    await handleCommitSlidePosition(slotId, position);
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
                {/* Banner Preview */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-axdoro-charcoal flex items-center justify-between">
                    <span>Live Banner Preview</span>
                    <span className="text-[11px] font-mono text-axdoro-text-muted">Slide Slot {activeSlide.id}</span>
                  </div>

                  <div className="relative w-full h-56 sm:h-72 md:h-80 rounded-xl overflow-hidden border border-axdoro-border bg-axdoro-bg shadow-sm group">
                    <img
                      src={activeSlide.imageUrl || '/hero-bg.jpg'}
                      alt={`Slide ${activeSlide.id} Preview`}
                      style={{
                        objectPosition: `50% ${activeSlide.imagePosition ?? 50}%`,
                      }}
                      className="w-full h-full object-cover transition-[object-position] duration-150"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.src.endsWith('/hero-bg.jpg')) {
                          target.src = '/hero-bg.jpg';
                        }
                      }}
                    />
                    <div className="absolute top-3 right-3 flex items-center gap-2">
                      {activeSlide.imageUrl ? (
                        <Badge variant="default" className="text-xs bg-axdoro-accent text-black font-semibold shadow-xs">
                          Custom Banner Image
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs bg-black/70 text-white border-white/20 shadow-xs">
                          Default Asset (/hero-bg.jpg)
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Vertical Framing / Alignment Controls (Presets + Fine-tuning Slider) */}
                <div className="p-3.5 sm:p-4 rounded-xl border border-axdoro-border bg-axdoro-surface-muted/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-axdoro-charcoal flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-axdoro-accent" />
                        <span>Vertical Image Alignment</span>
                      </span>
                      <p className="text-[11px] text-axdoro-text-muted mt-0.5">
                        Choose a preset or fine-tune with the slider to position heads, products, or text perfectly.
                      </p>
                    </div>

                    {/* Quick Presets: Top, Center, Bottom */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-axdoro-border self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleSetSlidePosition(activeSlide.id, 0)}
                        disabled={isSavingHero}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          (activeSlide.imagePosition ?? 50) === 0
                            ? 'bg-axdoro-charcoal text-white shadow-xs'
                            : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                        }`}
                      >
                        Top
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetSlidePosition(activeSlide.id, 50)}
                        disabled={isSavingHero}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          (activeSlide.imagePosition ?? 50) === 50
                            ? 'bg-axdoro-charcoal text-white shadow-xs'
                            : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                        }`}
                      >
                        Center
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetSlidePosition(activeSlide.id, 100)}
                        disabled={isSavingHero}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          (activeSlide.imagePosition ?? 50) === 100
                            ? 'bg-axdoro-charcoal text-white shadow-xs'
                            : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-neutral-100'
                        }`}
                      >
                        Bottom
                      </button>
                    </div>
                  </div>

                  {/* 0-100% Fine-tuning slider with live preview */}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-[11px] font-mono text-axdoro-text-muted w-12 flex-shrink-0">
                      0% (Top)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={activeSlide.imagePosition ?? 50}
                      onChange={(e) => handleSlidePositionChange(activeSlide.id, Number(e.target.value))}
                      onPointerUp={() => handleCommitSlidePosition(activeSlide.id)}
                      disabled={isSavingHero}
                      className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-axdoro-charcoal"
                      aria-label="Slide vertical alignment position"
                    />
                    <span className="text-[11px] font-mono text-axdoro-text-muted w-14 text-right flex-shrink-0">
                      100% (Btm)
                    </span>
                    <span className="text-xs font-mono font-bold text-axdoro-charcoal bg-white px-2 py-0.5 rounded border border-neutral-200 min-w-12 text-center">
                      {activeSlide.imagePosition ?? 50}%
                    </span>
                  </div>
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {activeSlide.imageUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetSlotImageToDefault(activeSlide.id)}
                        disabled={isSavingHero}
                        className="h-8 text-xs text-red-500 hover:text-red-600 hover:border-red-300"
                      >
                        Remove Image
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleOpenHeroModalForSlot(activeSlide.id)}
                      disabled={isSavingHero}
                      className="h-8 text-xs font-semibold px-3.5 bg-axdoro-purple text-white hover:bg-axdoro-purple-light flex items-center gap-1.5"
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
                    style={{
                      objectPosition: `50% ${heroSlides.find((s) => s.id === editingModalSlideId)?.imagePosition ?? 50}%`,
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

