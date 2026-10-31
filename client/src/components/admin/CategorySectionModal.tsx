import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Loader2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Upload,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  AdminCategory,
  CategorySectionCard,
  UpsertCategorySectionPayload,
  adminGetCategorySection,
  adminUpsertCategorySection,
  adminDeleteCategorySection,
  adminGetCategoryUploadSignature,
} from '../../api/admin.ts';
import { Button } from '../ui/button.tsx';
import { Input, Label } from '../ui/input.tsx';
import { Badge } from '../ui/badge.tsx';
import { useScrollLock } from '../../utils/scrollLock.ts';

interface CategorySectionModalProps {
  category: AdminCategory | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  allCategories: AdminCategory[];
}

export const CategorySectionModal: React.FC<CategorySectionModalProps> = ({
  category,
  isOpen,
  onClose,
  onSaved,
  allCategories,
}) => {
  useScrollLock(isOpen);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Section configuration form fields
  const [sectionId, setSectionId] = useState<string | null>(category?.section?.id || null);
  const [isEnabled, setIsEnabled] = useState<boolean>(category?.section?.isEnabled ?? true);
  const [displayOrder, setDisplayOrder] = useState<number>(
    category?.section?.displayOrder ?? category?.displayOrder ?? 0
  );
  const [heading, setHeading] = useState<string>(category?.section?.heading || category?.name || '');
  const [subtitle, setSubtitle] = useState<string>(category?.description || '');
  const [productLimit, setProductLimit] = useState<number>(4);
  const [viewAllLabel, setViewAllLabel] = useState<string>('View All');
  const [viewAllDestination, setViewAllDestination] = useState<string>(
    category ? `/category/${category.slug}` : ''
  );

  // Poster fields
  const [posterImageUrl, setPosterImageUrl] = useState<string>('');
  const [posterHeading, setPosterHeading] = useState<string>('');
  const [posterSubtitle, setPosterSubtitle] = useState<string>('');
  const [posterDestinationUrl, setPosterDestinationUrl] = useState<string>('');
  const [isUploadingPoster, setIsUploadingPoster] = useState<boolean>(false);
  const posterFileInputRef = useRef<HTMLInputElement>(null);

  // Shortcut cards list
  const [categoryCards, setCategoryCards] = useState<CategorySectionCard[]>([]);

  // Editing / adding a single shortcut card state
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null);
  const [cardFormId, setCardFormId] = useState<string>('');
  const [cardFormLabel, setCardFormLabel] = useState<string>('');
  const [cardFormSublabel, setCardFormSublabel] = useState<string>('');
  const [cardFormImageUrl, setCardFormImageUrl] = useState<string>('');
  const [cardFormDestinationType, setCardFormDestinationType] = useState<'category' | 'query'>('query');
  const [cardFormCategorySlug, setCardFormCategorySlug] = useState<string>('');
  const [cardFormQuery, setCardFormQuery] = useState<string>('');
  const [isUploadingCardImage, setIsUploadingCardImage] = useState<boolean>(false);
  const cardFileInputRef = useRef<HTMLInputElement>(null);

  // Load section data whenever modal opens
  useEffect(() => {
    if (!isOpen || !category) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setIsConfirmingDelete(false);
    setEditingCardIndex(null);

    adminGetCategorySection(category.id)
      .then((sec) => {
        if (!isMounted) return;
        if (sec) {
          setSectionId(sec.id);
          setIsEnabled(sec.isEnabled);
          setDisplayOrder(sec.displayOrder);
          setHeading(sec.heading || category.name);
          setSubtitle(sec.subtitle || '');
          setProductLimit(sec.productLimit || 4);
          setViewAllLabel(sec.viewAllLabel || 'View All');
          setViewAllDestination(sec.viewAllDestination || `/category/${category.slug}`);
          setPosterImageUrl(sec.posterImageUrl || '');
          setPosterHeading(sec.posterHeading || '');
          setPosterSubtitle(sec.posterSubtitle || '');
          setPosterDestinationUrl(sec.posterDestinationUrl || '');
          setCategoryCards(sec.categoryCards || []);
        } else {
          // Initialize fresh defaults for unconfigured category
          setSectionId(null);
          setIsEnabled(true);
          setDisplayOrder(category.displayOrder ?? 0);
          setHeading(category.name);
          setSubtitle(category.description || '');
          setProductLimit(4);
          setViewAllLabel('View All');
          setViewAllDestination(`/category/${category.slug}`);
          setPosterImageUrl('');
          setPosterHeading('');
          setPosterSubtitle('');
          setPosterDestinationUrl(`/category/${category.slug}`);
          setCategoryCards([]);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load category section configuration');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, category]);

  if (!isOpen || !category) return null;

  // Cloudinary upload helper for Poster
  const handlePosterFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPoster(true);
    setError(null);

    try {
      let signatureConfig;
      try {
        signatureConfig = await adminGetCategoryUploadSignature(category.id);
      } catch (sigErr: any) {
        if (sigErr?.code === 'CLOUDINARY_NOT_CONFIGURED') {
          throw new Error('Cloudinary is not configured on this server. Please enter a direct image URL.');
        }
        throw sigErr;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signatureConfig.apiKey);
      formData.append('timestamp', String(signatureConfig.timestamp));
      formData.append('signature', signatureConfig.signature);
      formData.append('folder', signatureConfig.folder);
      formData.append('public_id', signatureConfig.publicId);

      const res = await fetch(signatureConfig.uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const cloudErr = await res.json().catch(() => ({}));
        throw new Error(cloudErr?.error?.message || `Upload failed (HTTP ${res.status})`);
      }

      const cloudData = await res.json();
      setPosterImageUrl(cloudData.secure_url || cloudData.url);
      setSuccess('Poster image uploaded successfully.');
    } catch (err: any) {
      setError(err?.message || 'Failed to upload poster image');
    } finally {
      setIsUploadingPoster(false);
      if (posterFileInputRef.current) posterFileInputRef.current.value = '';
    }
  };

  // Cloudinary upload helper for Shortcut Card
  const handleCardImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCardImage(true);
    setError(null);

    try {
      let signatureConfig;
      try {
        signatureConfig = await adminGetCategoryUploadSignature(category.id);
      } catch (sigErr: any) {
        if (sigErr?.code === 'CLOUDINARY_NOT_CONFIGURED') {
          throw new Error('Cloudinary is not configured on this server. Please enter a direct image URL.');
        }
        throw sigErr;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signatureConfig.apiKey);
      formData.append('timestamp', String(signatureConfig.timestamp));
      formData.append('signature', signatureConfig.signature);
      formData.append('folder', signatureConfig.folder);
      formData.append('public_id', signatureConfig.publicId);

      const res = await fetch(signatureConfig.uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const cloudErr = await res.json().catch(() => ({}));
        throw new Error(cloudErr?.error?.message || `Upload failed (HTTP ${res.status})`);
      }

      const cloudData = await res.json();
      setCardFormImageUrl(cloudData.secure_url || cloudData.url);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload card image');
    } finally {
      setIsUploadingCardImage(false);
      if (cardFileInputRef.current) cardFileInputRef.current.value = '';
    }
  };

  // Card list operations
  const handleOpenAddCard = () => {
    setEditingCardIndex(-1);
    setCardFormId(`${category.slug}-shortcut-${Date.now().toString(36)}`);
    setCardFormLabel('');
    setCardFormSublabel('');
    setCardFormImageUrl(category.imageUrl || '');
    setCardFormDestinationType('query');
    setCardFormCategorySlug(category.slug);
    setCardFormQuery('');
  };

  const handleOpenEditCard = (index: number) => {
    const c = categoryCards[index];
    setEditingCardIndex(index);
    setCardFormId(c.id);
    setCardFormLabel(c.label);
    setCardFormSublabel(c.sublabel || '');
    setCardFormImageUrl(c.imageUrl);
    setCardFormDestinationType(c.destinationType || 'query');
    setCardFormCategorySlug(c.destinationCategorySlug || category.slug);
    setCardFormQuery(c.query || '');
  };

  const handleSaveCard = () => {
    if (!cardFormLabel.trim()) {
      setError('Shortcut card label is required.');
      return;
    }
    if (!cardFormImageUrl.trim()) {
      setError('Shortcut card image URL is required.');
      return;
    }

    const newCard: CategorySectionCard = {
      id: cardFormId.trim() || `card-${Date.now().toString(36)}`,
      label: cardFormLabel.trim(),
      sublabel: cardFormSublabel.trim() || null,
      imageUrl: cardFormImageUrl.trim(),
      destinationType: cardFormDestinationType,
      destinationCategorySlug:
        cardFormDestinationType === 'category' ? cardFormCategorySlug.trim() || null : null,
      query: cardFormDestinationType === 'query' ? cardFormQuery.trim() || null : null,
    };

    if (editingCardIndex === -1) {
      setCategoryCards([...categoryCards, newCard]);
    } else if (editingCardIndex !== null && editingCardIndex >= 0) {
      const updated = [...categoryCards];
      updated[editingCardIndex] = newCard;
      setCategoryCards(updated);
    }

    setEditingCardIndex(null);
    setError(null);
  };

  const handleRemoveCard = (index: number) => {
    const updated = categoryCards.filter((_, i) => i !== index);
    setCategoryCards(updated);
    if (editingCardIndex === index) {
      setEditingCardIndex(null);
    }
  };

  const handleMoveCard = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categoryCards.length) return;
    const updated = [...categoryCards];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setCategoryCards(updated);
  };

  // Section Save handler
  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!heading.trim()) {
      setError('Section heading is required.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const payload: UpsertCategorySectionPayload = {
      isEnabled,
      displayOrder: Number(displayOrder) || 0,
      heading: heading.trim(),
      subtitle: subtitle.trim() || null,
      productLimit: Math.min(Math.max(Number(productLimit) || 4, 1), 20),
      viewAllLabel: viewAllLabel.trim() || 'View All',
      viewAllDestination: viewAllDestination.trim() || null,
      posterImageUrl: posterImageUrl.trim() || null,
      posterHeading: posterHeading.trim() || null,
      posterSubtitle: posterSubtitle.trim() || null,
      posterDestinationUrl: posterDestinationUrl.trim() || null,
      categoryCards,
    };

    try {
      const saved = await adminUpsertCategorySection(category.id, payload);
      setSectionId(saved.id);
      setSuccess('Homepage section saved successfully.');
      onSaved();
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err?.message || 'Failed to save category section');
    } finally {
      setIsSaving(false);
    }
  };

  // Section Delete handler
  const handleDeleteSection = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await adminDeleteCategorySection(category.id);
      setSuccess('Homepage category section deleted successfully. (Category & products preserved)');
      onSaved();
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete category section');
    } finally {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-section-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl bg-axdoro-surface border border-axdoro-border rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-axdoro-border bg-axdoro-surface-muted/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-axdoro-purple/10 text-axdoro-purple flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="category-section-modal-title"
                className="text-base font-bold text-axdoro-charcoal flex items-center gap-2"
              >
                Homepage Section: {category.name}
                {sectionId ? (
                  <Badge variant={isEnabled ? 'success' : 'outline'} className="text-[10px] font-mono">
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">
                    Not Yet Configured
                  </Badge>
                )}
              </h2>
              <p className="text-xs text-axdoro-text-muted mt-0.5">
                Configure promotional cards, poster banner, and product limits for /category/{category.slug}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-axdoro-text-muted hover:text-axdoro-charcoal p-1.5 rounded-lg hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900 p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-axdoro-text-muted">
              <Loader2 className="w-7 h-7 animate-spin text-axdoro-accent" />
              <span className="text-xs font-medium">Loading section settings...</span>
            </div>
          ) : (
            <form id="category-section-form" onSubmit={handleSaveSection} className="space-y-6">
              {/* Section General Info */}
              <div className="bg-axdoro-surface-muted/30 p-4 rounded-xl border border-axdoro-border space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-axdoro-charcoal flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-axdoro-purple" /> General Section Settings
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="checkbox"
                      id="sec-is-enabled"
                      checked={isEnabled}
                      onChange={(e) => setIsEnabled(e.target.checked)}
                      className="w-4 h-4 text-axdoro-purple rounded border-axdoro-border focus:ring-axdoro-accent"
                    />
                    <Label htmlFor="sec-is-enabled" className="text-xs font-semibold cursor-pointer">
                      Show on Homepage
                    </Label>
                  </div>

                  <div>
                    <Label htmlFor="sec-order" className="text-xs">
                      Display Order
                    </Label>
                    <Input
                      id="sec-order"
                      type="number"
                      min={0}
                      value={displayOrder}
                      onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
                      className="mt-1 text-xs"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="sec-product-limit" className="text-xs">
                      Product Limit (1 - 20)
                    </Label>
                    <Input
                      id="sec-product-limit"
                      type="number"
                      min={1}
                      max={20}
                      value={productLimit}
                      onChange={(e) => setProductLimit(parseInt(e.target.value, 10) || 4)}
                      className="mt-1 text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="sec-heading" className="text-xs">
                      Section Heading *
                    </Label>
                    <Input
                      id="sec-heading"
                      type="text"
                      maxLength={150}
                      value={heading}
                      onChange={(e) => setHeading(e.target.value)}
                      placeholder="e.g. Pants & Trousers"
                      className="mt-1 text-xs"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="sec-subtitle" className="text-xs">
                      Section Subtitle
                    </Label>
                    <Input
                      id="sec-subtitle"
                      type="text"
                      maxLength={1000}
                      value={subtitle}
                      onChange={(e) => setSubtitle(e.target.value)}
                      placeholder="e.g. Relaxed, pleated, and contemporary cuts engineered for all-day comfort"
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="sec-viewall-label" className="text-xs">
                      View All Button Label *
                    </Label>
                    <Input
                      id="sec-viewall-label"
                      type="text"
                      maxLength={50}
                      value={viewAllLabel}
                      onChange={(e) => setViewAllLabel(e.target.value)}
                      placeholder="View All"
                      className="mt-1 text-xs"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="sec-viewall-dest" className="text-xs">
                      View All Destination (relative path)
                    </Label>
                    <Input
                      id="sec-viewall-dest"
                      type="text"
                      value={viewAllDestination}
                      onChange={(e) => setViewAllDestination(e.target.value)}
                      placeholder={`/category/${category.slug}`}
                      className="mt-1 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Shortcut Cards Section */}
              <div className="bg-axdoro-surface-muted/30 p-4 rounded-xl border border-axdoro-border space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-axdoro-charcoal flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-axdoro-purple" /> Category Shortcut Cards ({categoryCards.length})
                    </h3>
                    <p className="text-[11px] text-axdoro-text-muted mt-0.5">
                      Portrait visual filter cards displayed in the horizontal scroll strip.
                    </p>
                  </div>
                  {editingCardIndex === null && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleOpenAddCard}
                      className="h-8 text-xs font-semibold px-3"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Card
                    </Button>
                  )}
                </div>

                {/* Edit / Add Card Sub-Form */}
                {editingCardIndex !== null && (
                  <div className="p-4 bg-white rounded-xl border-2 border-axdoro-purple/40 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-axdoro-border pb-2">
                      <span className="text-xs font-bold text-axdoro-charcoal">
                        {editingCardIndex === -1 ? 'Add Shortcut Card' : `Edit Shortcut Card #${editingCardIndex + 1}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingCardIndex(null)}
                        className="text-axdoro-text-muted hover:text-axdoro-charcoal"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="card-label" className="text-xs">
                          Label *
                        </Label>
                        <Input
                          id="card-label"
                          type="text"
                          maxLength={100}
                          value={cardFormLabel}
                          onChange={(e) => setCardFormLabel(e.target.value)}
                          placeholder="e.g. Bootcut"
                          className="mt-1 text-xs"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="card-sublabel" className="text-xs">
                          Sublabel
                        </Label>
                        <Input
                          id="card-sublabel"
                          type="text"
                          maxLength={100}
                          value={cardFormSublabel}
                          onChange={(e) => setCardFormSublabel(e.target.value)}
                          placeholder="e.g. Pants"
                          className="mt-1 text-xs"
                        />
                      </div>
                    </div>

                    {/* Card Image */}
                    <div>
                      <Label htmlFor="card-image-url" className="text-xs">
                        Card Image URL *
                      </Label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          id="card-image-url"
                          type="text"
                          value={cardFormImageUrl}
                          onChange={(e) => setCardFormImageUrl(e.target.value)}
                          placeholder="https://images.unsplash.com/... or upload"
                          className="text-xs flex-1"
                          required
                        />
                        <input
                          ref={cardFileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleCardImageFileUpload}
                          className="hidden"
                          id="card-image-file"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isUploadingCardImage}
                          onClick={() => cardFileInputRef.current?.click()}
                          className="h-9 px-3 text-xs"
                        >
                          {isUploadingCardImage ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5 mr-1" /> Upload
                            </>
                          )}
                        </Button>
                      </div>
                      {cardFormImageUrl && (
                        <div className="mt-2 flex items-center gap-3">
                          <img
                            src={cardFormImageUrl}
                            alt="Card preview"
                            className="w-12 h-16 object-cover rounded-lg border border-axdoro-border shadow-xs"
                          />
                          <span className="text-[11px] text-axdoro-text-muted">Image preview</span>
                        </div>
                      )}
                    </div>

                    {/* Destination Config */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <Label htmlFor="card-dest-type" className="text-xs">
                          Destination Action
                        </Label>
                        <select
                          id="card-dest-type"
                          value={cardFormDestinationType}
                          onChange={(e) =>
                            setCardFormDestinationType(e.target.value as 'category' | 'query')
                          }
                          className="mt-1 block w-full rounded-md border border-axdoro-border bg-white px-3 py-2 text-xs focus:border-axdoro-accent focus:outline-none focus:ring-1 focus:ring-axdoro-accent"
                        >
                          <option value="query">Filter Category Products by Query Term</option>
                          <option value="category">Navigate to another Category Page</option>
                        </select>
                      </div>

                      {cardFormDestinationType === 'query' ? (
                        <div>
                          <Label htmlFor="card-query" className="text-xs">
                            Product Query Filter Term
                          </Label>
                          <Input
                            id="card-query"
                            type="text"
                            maxLength={100}
                            value={cardFormQuery}
                            onChange={(e) => setCardFormQuery(e.target.value)}
                            placeholder={cardFormLabel || 'Search term (e.g. Bootcut)'}
                            className="mt-1 text-xs"
                          />
                        </div>
                      ) : (
                        <div>
                          <Label htmlFor="card-cat-dest" className="text-xs">
                            Target Category Route
                          </Label>
                          <select
                            id="card-cat-dest"
                            value={cardFormCategorySlug}
                            onChange={(e) => setCardFormCategorySlug(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-axdoro-border bg-white px-3 py-2 text-xs focus:border-axdoro-accent focus:outline-none focus:ring-1 focus:ring-axdoro-accent"
                          >
                            {allCategories.map((cat) => (
                              <option key={cat.id} value={cat.slug}>
                                {cat.name} (/category/{cat.slug})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-axdoro-border">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingCardIndex(null)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveCard}
                        className="text-xs font-semibold"
                      >
                        {editingCardIndex === -1 ? 'Add to Section' : 'Update Card'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Cards List */}
                {categoryCards.length === 0 ? (
                  <p className="text-xs text-axdoro-text-muted italic py-2">
                    No shortcut cards added yet. Click &ldquo;Add Card&rdquo; to create quick-filter cards.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {categoryCards.map((card, idx) => (
                      <div
                        key={card.id || idx}
                        className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-axdoro-border shadow-xs hover:border-axdoro-border/80 transition-colors"
                      >
                        <img
                          src={card.imageUrl}
                          alt={card.label}
                          className="w-10 h-14 object-cover rounded-md border border-axdoro-border flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-axdoro-charcoal truncate">{card.label}</p>
                          {card.sublabel && (
                            <p className="text-[10px] text-axdoro-text-muted uppercase tracking-wider truncate">
                              {card.sublabel}
                            </p>
                          )}
                          <span className="inline-block text-[10px] font-mono text-axdoro-accent-muted bg-axdoro-surface-muted px-1.5 py-0.5 rounded mt-0.5">
                            {card.destinationType === 'category'
                              ? `/category/${card.destinationCategorySlug}`
                              : `Query: "${card.query || card.label}"`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveCard(idx, 'up')}
                            className="p-1 text-axdoro-text-muted hover:text-axdoro-charcoal disabled:opacity-30 cursor-pointer"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === categoryCards.length - 1}
                            onClick={() => handleMoveCard(idx, 'down')}
                            className="p-1 text-axdoro-text-muted hover:text-axdoro-charcoal disabled:opacity-30 cursor-pointer"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditCard(idx)}
                            className="p-1 text-axdoro-accent hover:text-axdoro-purple cursor-pointer text-xs font-semibold"
                            title="Edit Card"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCard(idx)}
                            className="p-1 text-red-600 hover:text-red-800 cursor-pointer"
                            title="Remove Card"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Promotional Poster Banner Section */}
              <div className="bg-axdoro-surface-muted/30 p-4 rounded-xl border border-axdoro-border space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-axdoro-charcoal flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-axdoro-purple" /> Full-Width Promotional Poster Banner (Optional)
                </h3>

                <div>
                  <Label htmlFor="poster-img-url" className="text-xs">
                    Poster Image URL
                  </Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      id="poster-img-url"
                      type="text"
                      value={posterImageUrl}
                      onChange={(e) => setPosterImageUrl(e.target.value)}
                      placeholder="https://images.unsplash.com/... or upload via Cloudinary"
                      className="text-xs flex-1"
                    />
                    <input
                      ref={posterFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePosterFileUpload}
                      className="hidden"
                      id="poster-file-input"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isUploadingPoster}
                      onClick={() => posterFileInputRef.current?.click()}
                      className="h-9 px-3 text-xs"
                    >
                      {isUploadingPoster ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5 mr-1" /> Upload Image
                        </>
                      )}
                    </Button>
                  </div>
                  {posterImageUrl && (
                    <div className="mt-2 relative aspect-[21/8] max-h-36 rounded-lg overflow-hidden border border-axdoro-border shadow-xs">
                      <img
                        src={posterImageUrl}
                        alt="Poster preview"
                        className="w-full h-full object-cover object-center"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-between p-3 text-white">
                        <div>
                          <p className="text-xs font-bold uppercase">{posterHeading || 'Poster Heading'}</p>
                          <p className="text-[10px] text-neutral-200">{posterSubtitle || 'Poster Subtitle'}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setPosterImageUrl('')}
                          className="text-white hover:text-red-300 h-7 px-2 text-xs"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="poster-heading" className="text-xs">
                      Poster Heading
                    </Label>
                    <Input
                      id="poster-heading"
                      type="text"
                      maxLength={150}
                      value={posterHeading}
                      onChange={(e) => setPosterHeading(e.target.value)}
                      placeholder="e.g. Loose Fit Pleated Pants"
                      className="mt-1 text-xs"
                    />
                  </div>

                  <div>
                    <Label htmlFor="poster-subtitle" className="text-xs">
                      Poster Subtitle
                    </Label>
                    <Input
                      id="poster-subtitle"
                      type="text"
                      maxLength={1000}
                      value={posterSubtitle}
                      onChange={(e) => setPosterSubtitle(e.target.value)}
                      placeholder="e.g. Architectural drape cut from tailored cotton-blend foundations"
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="poster-dest-url" className="text-xs">
                    Poster Click Destination (relative /path or https:// URL)
                  </Label>
                  <Input
                    id="poster-dest-url"
                    type="text"
                    value={posterDestinationUrl}
                    onChange={(e) => setPosterDestinationUrl(e.target.value)}
                    placeholder={`/category/${category.slug}`}
                    className="mt-1 text-xs font-mono"
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-axdoro-border bg-axdoro-surface-muted/50">
          <div>
            {sectionId && !isConfirmingDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmingDelete(true)}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Section
              </Button>
            )}

            {isConfirmingDelete && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-red-700 font-medium">
                  Delete section config? (Category & products are safe)
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={isDeleting}
                  onClick={handleDeleteSection}
                  className="h-8 text-xs font-semibold"
                >
                  {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm Delete'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConfirmingDelete(false)}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              form="category-section-form"
              size="sm"
              disabled={isSaving || isLoading}
              className="text-xs font-semibold px-4"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Saving...
                </>
              ) : (
                'Save Homepage Section'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
