import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderTree,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  X,
  ArrowUpDown,
  ShoppingBag,
  Image as ImageIcon,
  Upload,
  Link as LinkIcon,
  Trash2,
  LayoutTemplate,
} from 'lucide-react';
import {
  AdminCategory,
  adminGetCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminGetCategoryUploadSignature,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from '../../api/admin.ts';
import { CategorySectionModal } from './CategorySectionModal.tsx';
import { CategorySectionReorderModal } from './CategorySectionReorderModal.tsx';
import { Button } from '../ui/button.tsx';
import { Input, Label } from '../ui/input.tsx';
import { Badge } from '../ui/badge.tsx';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../ui/table.tsx';
import { useScrollLock } from '../../utils/scrollLock.ts';

interface CategoryManagementViewProps {
  onCategoryMutated?: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const CategoryManagementView: React.FC<CategoryManagementViewProps> = ({
  onCategoryMutated,
}) => {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Add category modal state
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [addName, setAddName] = useState<string>('');
  const [addSlug, setAddSlug] = useState<string>('');
  const [isAddSlugManual, setIsAddSlugManual] = useState<boolean>(false);
  const [addDescription, setAddDescription] = useState<string>('');
  const [addDisplayOrder, setAddDisplayOrder] = useState<number>(0);
  const [addIsActive, setAddIsActive] = useState<boolean>(true);
  const [addImageUrl, setAddImageUrl] = useState<string>('');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit category modal state
  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editSlug, setEditSlug] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editDisplayOrder, setEditDisplayOrder] = useState<number>(0);
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editImageUrl, setEditImageUrl] = useState<string>('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Category Image modal state
  const [imageModalCategory, setImageModalCategory] = useState<AdminCategory | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState<string>('');
  const [useManualUrl, setUseManualUrl] = useState<boolean>(false);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [imageModalError, setImageModalError] = useState<string | null>(null);
  const [imageModalSuccess, setImageModalSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Category Section modal state
  const [selectedSectionCategory, setSelectedSectionCategory] = useState<AdminCategory | null>(null);
  const [isSectionModalOpen, setIsSectionModalOpen] = useState<boolean>(false);
  const [isReorderModalOpen, setIsReorderModalOpen] = useState<boolean>(false);

  // Global reference-counted scroll lock while add or edit category dialog is open
  useScrollLock(isAddOpen || Boolean(editingCategory));
  useScrollLock(Boolean(imageModalCategory));
  useScrollLock(isSectionModalOpen || isReorderModalOpen);

  // Quick toggle loading state
  const [togglingCategoryId, setTogglingCategoryId] = useState<string | null>(null);

  // Clean up object preview URL
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminGetCategories();
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Image Modal Handlers
  const handleOpenImageModal = (cat: AdminCategory) => {
    setImageModalCategory(cat);
    setSelectedFile(null);
    setPreviewUrl(cat.imageUrl || null);
    setManualUrl(cat.imageUrl || '');
    setUseManualUrl(false);
    setImageModalError(null);
    setImageModalSuccess(null);
  };

  const handleCloseImageModal = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setImageModalCategory(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setManualUrl('');
    setUseManualUrl(false);
    setImageModalError(null);
    setImageModalSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setImageModalError(null);
    }
  };

  const handleClearSelectedFile = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(imageModalCategory?.imageUrl || null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveCategoryImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageModalCategory) return;
    setImageModalError(null);
    setImageModalSuccess(null);
    setIsUploadingImage(true);

    try {
      if (useManualUrl) {
        const cleanUrl = manualUrl.trim();
        if (!cleanUrl) {
          setImageModalError('Please enter a valid image URL');
          setIsUploadingImage(false);
          return;
        }

        await adminUpdateCategory(imageModalCategory.id, {
          imageUrl: cleanUrl,
          publicId: null,
        });

        setImageModalSuccess('Category image updated successfully.');
        await loadCategories();
        onCategoryMutated?.();
        setTimeout(() => {
          handleCloseImageModal();
        }, 1200);
        return;
      }

      if (!selectedFile) {
        setImageModalError('Please select an image file to upload.');
        setIsUploadingImage(false);
        return;
      }

      // 1. Request signature from backend
      let signatureConfig;
      try {
        signatureConfig = await adminGetCategoryUploadSignature(imageModalCategory.id);
      } catch (err: any) {
        if (err.code === 'CLOUDINARY_NOT_CONFIGURED') {
          setUseManualUrl(true);
          setImageModalError(
            'Cloudinary credentials are not configured on this server. Switched to direct image URL mode.'
          );
          setIsUploadingImage(false);
          return;
        }
        throw err;
      }

      // 2. Direct-to-Cloudinary upload
      const formData = new FormData();
      formData.append('file', selectedFile);
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

      // 3. Persist new image URL and public_id in PostgreSQL
      await adminUpdateCategory(imageModalCategory.id, {
        imageUrl: cloudData.secure_url || cloudData.url,
        publicId: cloudData.public_id,
      });

      setImageModalSuccess('Category image uploaded and saved successfully.');
      await loadCategories();
      onCategoryMutated?.();
      setTimeout(() => {
        handleCloseImageModal();
      }, 1200);
    } catch (err: unknown) {
      setImageModalError(err instanceof Error ? err.message : 'Failed to update category image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleRemoveCurrentImage = async () => {
    if (!imageModalCategory) return;
    setImageModalError(null);
    setImageModalSuccess(null);
    setIsUploadingImage(true);
    try {
      await adminUpdateCategory(imageModalCategory.id, {
        imageUrl: null,
        publicId: null,
      });
      setImageModalSuccess('Category image removed.');
      await loadCategories();
      onCategoryMutated?.();
      setTimeout(() => {
        handleCloseImageModal();
      }, 1200);
    } catch (err: unknown) {
      setImageModalError(err instanceof Error ? err.message : 'Failed to remove category image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Handle open Add Modal
  const handleOpenAddModal = () => {
    setAddName('');
    setAddSlug('');
    setIsAddSlugManual(false);
    setAddDescription('');
    setAddImageUrl('');
    // Propose next display order
    const nextOrder = categories.length > 0
      ? Math.max(...categories.map((c) => c.displayOrder)) + 1
      : 1;
    setAddDisplayOrder(nextOrder);
    setAddIsActive(true);
    setAddError(null);
    setIsAddOpen(true);
  };

  // Handle Add form submit
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const cleanName = addName.trim();
    const cleanSlug = addSlug.trim();

    if (!cleanName) {
      setAddError('Category name is required');
      return;
    }
    if (!cleanSlug) {
      setAddError('Category slug is required');
      return;
    }
    if (!SLUG_REGEX.test(cleanSlug)) {
      setAddError('Slug must contain only lowercase letters, numbers, and hyphens (e.g. t-shirts, casual-shorts)');
      return;
    }

    setIsSubmittingAdd(true);
    try {
      const payload: CreateCategoryPayload = {
        name: cleanName,
        slug: cleanSlug,
        description: addDescription.trim() || undefined,
        displayOrder: Number(addDisplayOrder) || 0,
        isActive: addIsActive,
        imageUrl: addImageUrl.trim() || undefined,
      };

      await adminCreateCategory(payload);
      setIsAddOpen(false);
      setSuccessMessage(`Category "${cleanName}" created successfully.`);
      await loadCategories();
      onCategoryMutated?.();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Handle open Edit Modal
  const handleOpenEditModal = (cat: AdminCategory) => {
    setEditingCategory(cat);
    setEditName(cat.name);
    setEditSlug(cat.slug);
    setEditDescription(cat.description || '');
    setEditDisplayOrder(cat.displayOrder);
    setEditIsActive(cat.isActive);
    setEditImageUrl(cat.imageUrl || '');
    setEditError(null);
  };

  // Handle Edit form submit
  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    setEditError(null);

    const cleanName = editName.trim();
    const cleanSlug = editSlug.trim();

    if (!cleanName) {
      setEditError('Category name is required');
      return;
    }
    if (!cleanSlug) {
      setEditError('Category slug is required');
      return;
    }
    if (!SLUG_REGEX.test(cleanSlug)) {
      setEditError('Slug must contain only lowercase letters, numbers, and hyphens');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const payload: UpdateCategoryPayload = {
        name: cleanName,
        slug: cleanSlug,
        description: editDescription.trim() || null,
        displayOrder: Number(editDisplayOrder) || 0,
        isActive: editIsActive,
        imageUrl: editImageUrl.trim() || null,
      };

      await adminUpdateCategory(editingCategory.id, payload);
      setEditingCategory(null);
      setSuccessMessage(`Category "${cleanName}" updated successfully.`);
      await loadCategories();
      onCategoryMutated?.();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update category');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Handle Quick Active/Inactive Toggle
  const handleToggleActive = async (cat: AdminCategory) => {
    setTogglingCategoryId(cat.id);
    setSuccessMessage(null);
    setError(null);
    try {
      const newStatus = !cat.isActive;
      await adminUpdateCategory(cat.id, { isActive: newStatus });
      setSuccessMessage(`Category "${cat.name}" is now ${newStatus ? 'active' : 'inactive'}.`);
      await loadCategories();
      onCategoryMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle category status');
    } finally {
      setTogglingCategoryId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-axdoro-accent" />
            <h2 className="text-lg font-bold text-axdoro-charcoal tracking-tight">Category Management</h2>
            <Badge variant="secondary" className="font-mono text-xs">
              {categories.length} total
            </Badge>
          </div>
          <p className="text-xs text-axdoro-text-muted mt-1">
            Manage storefront product categories, display ordering, and visibility. Deactivated categories and their products are immediately hidden from public navigation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsReorderModalOpen(true)}
            className="flex items-center gap-2 text-xs font-semibold py-2 px-3 shadow-xs border-axdoro-border text-axdoro-charcoal hover:bg-axdoro-surface-muted"
            title="Reorder Homepage Category Sections"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Reorder Sections</span>
          </Button>

          <Button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 text-xs font-semibold py-2 px-4 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Category</span>
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900 p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Categories Table */}
      <div className="bg-axdoro-surface border border-axdoro-border rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-axdoro-text-muted">
            <Loader2 className="w-6 h-6 animate-spin text-axdoro-accent" />
            <span className="text-xs font-medium">Loading product categories...</span>
          </div>
        ) : categories.length === 0 ? (
          <div className="py-16 text-center text-axdoro-text-muted space-y-3">
            <FolderTree className="w-10 h-10 mx-auto text-axdoro-text-muted/40" />
            <p className="text-sm font-semibold text-axdoro-charcoal">No categories defined yet</p>
            <p className="text-xs max-w-sm mx-auto">
              Create your first product category to organize your catalogue and establish storefront navigation.
            </p>
            <Button size="sm" onClick={handleOpenAddModal} className="mt-2">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Category
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-axdoro-border bg-axdoro-surface-muted/50">
                  <TableHead className="w-16 text-center font-mono text-[11px]">Order</TableHead>
                  <TableHead className="w-16 text-center font-semibold text-xs">Image</TableHead>
                  <TableHead className="font-semibold text-xs">Name</TableHead>
                  <TableHead className="font-mono text-[11px]">Slug / Route</TableHead>
                  <TableHead className="font-semibold text-xs">Description</TableHead>
                  <TableHead className="text-center font-semibold text-xs">Products</TableHead>
                  <TableHead className="text-center font-semibold text-xs">Status</TableHead>
                  <TableHead className="text-center font-semibold text-xs">Homepage Section</TableHead>
                  <TableHead className="text-right font-semibold text-xs pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => {
                  const isToggling = togglingCategoryId === cat.id;
                  return (
                    <TableRow
                      key={cat.id}
                      className="border-b border-axdoro-border hover:bg-axdoro-surface-muted/30 transition-colors"
                    >
                      <TableCell className="text-center font-mono text-xs text-axdoro-text-muted font-bold">
                        {cat.displayOrder}
                      </TableCell>
                      <TableCell className="text-center p-2">
                        {cat.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => handleOpenImageModal(cat)}
                            className="group relative block w-10 h-10 rounded-lg overflow-hidden border border-axdoro-border mx-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent shadow-xs"
                            title="Click to view/change image"
                          >
                            <img
                              src={cat.imageUrl}
                              alt={cat.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Upload className="w-3.5 h-3.5 text-white" />
                            </div>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenImageModal(cat)}
                            className="w-10 h-10 rounded-lg bg-axdoro-surface-muted border border-dashed border-axdoro-border flex items-center justify-center text-axdoro-text-muted hover:text-axdoro-accent hover:border-axdoro-accent/50 transition-colors mx-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                            title="Upload category image"
                          >
                            <ImageIcon className="w-4 h-4" />
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold text-xs text-axdoro-charcoal">
                        {cat.name}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-axdoro-accent-muted">
                        /category/{cat.slug}
                      </TableCell>
                      <TableCell className="text-xs text-axdoro-text-muted max-w-xs truncate">
                        {cat.description || <span className="italic text-axdoro-text-muted/50">None</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-axdoro-charcoal font-semibold bg-axdoro-surface-muted px-2 py-0.5 rounded-full border border-axdoro-border">
                          <ShoppingBag className="w-3 h-3 text-axdoro-text-muted" />
                          {cat.productCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {cat.isActive ? (
                          <Badge variant="success" className="gap-1 text-[11px] py-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-[11px] py-0.5 text-axdoro-text-muted border-axdoro-border">
                            <XCircle className="w-3 h-3" /> Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {cat.section ? (
                          <Badge
                            variant={cat.section.isEnabled ? 'success' : 'outline'}
                            className={`gap-1 text-[11px] py-0.5 ${!cat.section.isEnabled ? 'text-axdoro-text-muted border-axdoro-border' : ''}`}
                          >
                            <LayoutTemplate className="w-3 h-3" />
                            #{cat.section.displayOrder} {cat.section.isEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-axdoro-text-muted italic">Not configured</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedSectionCategory(cat);
                              setIsSectionModalOpen(true);
                            }}
                            className="h-8 text-xs font-semibold px-2.5 text-axdoro-purple hover:text-axdoro-purple hover:bg-axdoro-purple/10 border-axdoro-border"
                            title="Manage Homepage Category Section"
                          >
                            <LayoutTemplate className="w-3.5 h-3.5 mr-1" /> Section
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenImageModal(cat)}
                            className="h-8 text-xs font-semibold px-2.5 text-axdoro-accent hover:text-axdoro-accent hover:bg-axdoro-purple/10 border-axdoro-border"
                            title="Upload or Change Category Image"
                          >
                            <ImageIcon className="w-3.5 h-3.5 mr-1" /> Image
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEditModal(cat)}
                            className="h-8 text-xs font-semibold px-2.5"
                            title="Edit Category Details"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleActive(cat)}
                            disabled={isToggling}
                            className={`h-8 text-xs font-semibold px-2.5 ${
                              cat.isActive
                                ? 'text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-200'
                                : 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200'
                            }`}
                            title={cat.isActive ? 'Deactivate category' : 'Activate category'}
                          >
                            {isToggling ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : cat.isActive ? (
                              'Deactivate'
                            ) : (
                              'Activate'
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add Category Dialog Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain animate-in fade-in">
          <div className="bg-axdoro-surface border border-axdoro-border rounded-2xl shadow-elevated w-full max-w-lg max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col my-auto overflow-hidden">
            <div className="px-6 py-4 border-b border-axdoro-border flex items-center justify-between shrink-0 bg-axdoro-surface">
              <div className="flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-axdoro-accent" />
                <h3 className="text-sm font-bold text-axdoro-charcoal">Create New Category</h3>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="p-1.5 text-axdoro-text-muted hover:text-axdoro-charcoal rounded-lg hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
              {addError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="add-name" className="text-xs font-semibold">
                  Category Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="add-name"
                  type="text"
                  placeholder="e.g. Formal Shirts, Chinos, Shorts"
                  value={addName}
                  onChange={(e) => {
                    const newName = e.target.value;
                    setAddName(newName);
                    if (!isAddSlugManual) {
                      setAddSlug(slugify(newName));
                    }
                  }}
                  className="text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="add-slug" className="text-xs font-semibold">
                    Category Slug <span className="text-red-500">*</span>
                  </Label>
                  <span className="text-[11px] font-mono text-axdoro-text-muted">
                    /category/{addSlug || '...'}
                  </span>
                </div>
                <Input
                  id="add-slug"
                  type="text"
                  placeholder="e.g. formal-shirts"
                  value={addSlug}
                  onChange={(e) => {
                    setIsAddSlugManual(true);
                    setAddSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  }}
                  className="text-xs font-mono"
                  required
                />
                <p className="text-[11px] text-axdoro-text-muted">
                  Used in storefront URLs. Only lowercase alphanumeric characters and hyphens allowed.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-image-url" className="text-xs font-semibold">
                  Category Image URL <span className="text-axdoro-text-muted font-normal">(optional)</span>
                </Label>
                <Input
                  id="add-image-url"
                  type="url"
                  placeholder="https://images.unsplash.com/... or Cloudinary URL"
                  value={addImageUrl}
                  onChange={(e) => setAddImageUrl(e.target.value)}
                  className="text-xs font-mono"
                />
                <p className="text-[11px] text-axdoro-text-muted">
                  Direct image URL. You can also upload hosted files using the Image button after creation.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-description" className="text-xs font-semibold">
                  Description <span className="text-axdoro-text-muted font-normal">(optional)</span>
                </Label>
                <textarea
                  id="add-description"
                  rows={3}
                  placeholder="Editorial description displayed on the dedicated category page..."
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  className="w-full text-xs rounded-lg border border-axdoro-border bg-transparent p-2.5 focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="add-order" className="text-xs font-semibold flex items-center gap-1">
                    <ArrowUpDown className="w-3.5 h-3.5 text-axdoro-text-muted" /> Display Order
                  </Label>
                  <Input
                    id="add-order"
                    type="number"
                    value={addDisplayOrder}
                    onChange={(e) => setAddDisplayOrder(parseInt(e.target.value, 10) || 0)}
                    className="text-xs font-mono"
                  />
                  <p className="text-[10px] text-axdoro-text-muted">Lower numbers appear first.</p>
                </div>

                <div className="space-y-1.5 flex flex-col justify-center">
                  <Label className="text-xs font-semibold mb-2">Visibility</Label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={addIsActive}
                      onChange={(e) => setAddIsActive(e.target.checked)}
                      className="rounded border-axdoro-border text-axdoro-accent focus:ring-axdoro-accent h-4 w-4"
                    />
                    <span className="text-xs font-semibold text-axdoro-charcoal">
                      Active on Storefront
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-axdoro-border flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddOpen(false)}
                  disabled={isSubmittingAdd}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingAdd}
                  className="shadow-sm"
                >
                  {isSubmittingAdd ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Creating...
                    </>
                  ) : (
                    'Create Category'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Dialog Modal */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain animate-in fade-in">
          <div className="bg-axdoro-surface border border-axdoro-border rounded-2xl shadow-elevated w-full max-w-lg max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col my-auto overflow-hidden">
            <div className="px-6 py-4 border-b border-axdoro-border flex items-center justify-between shrink-0 bg-axdoro-surface">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-axdoro-accent" />
                <h3 className="text-sm font-bold text-axdoro-charcoal">
                  Edit Category: {editingCategory.name}
                </h3>
              </div>
              <button
                onClick={() => setEditingCategory(null)}
                className="p-1.5 text-axdoro-text-muted hover:text-axdoro-charcoal rounded-lg hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateCategory} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs font-semibold">
                  Category Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-slug" className="text-xs font-semibold">
                    Category Slug <span className="text-red-500">*</span>
                  </Label>
                  <span className="text-[11px] font-mono text-axdoro-text-muted">
                    /category/{editSlug}
                  </span>
                </div>
                <Input
                  id="edit-slug"
                  type="text"
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="text-xs font-mono"
                  required
                />
                <p className="text-[11px] text-axdoro-text-muted">
                  Changing the slug alters existing storefront URLs for this category.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-image-url" className="text-xs font-semibold">
                    Category Image URL <span className="text-axdoro-text-muted font-normal">(optional)</span>
                  </Label>
                  {editingCategory.imageUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetCat = editingCategory;
                        setEditingCategory(null);
                        handleOpenImageModal(targetCat);
                      }}
                      className="text-[11px] text-axdoro-accent hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3 h-3" /> Upload / Replace
                    </button>
                  )}
                </div>
                <Input
                  id="edit-image-url"
                  type="url"
                  value={editImageUrl}
                  placeholder="https://..."
                  onChange={(e) => setEditImageUrl(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-description" className="text-xs font-semibold">
                  Description <span className="text-axdoro-text-muted font-normal">(optional)</span>
                </Label>
                <textarea
                  id="edit-description"
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full text-xs rounded-lg border border-axdoro-border bg-transparent p-2.5 focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-order" className="text-xs font-semibold flex items-center gap-1">
                    <ArrowUpDown className="w-3.5 h-3.5 text-axdoro-text-muted" /> Display Order
                  </Label>
                  <Input
                    id="edit-order"
                    type="number"
                    value={editDisplayOrder}
                    onChange={(e) => setEditDisplayOrder(parseInt(e.target.value, 10) || 0)}
                    className="text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5 flex flex-col justify-center">
                  <Label className="text-xs font-semibold mb-2">Visibility</Label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="rounded border-axdoro-border text-axdoro-accent focus:ring-axdoro-accent h-4 w-4"
                    />
                    <span className="text-xs font-semibold text-axdoro-charcoal">
                      Active on Storefront
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-axdoro-border flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingCategory(null)}
                  disabled={isSubmittingEdit}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingEdit}
                  className="shadow-sm"
                >
                  {isSubmittingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Image Management Dialog Modal */}
      {imageModalCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain animate-in fade-in">
          <div className="bg-axdoro-surface border border-axdoro-border rounded-2xl shadow-elevated w-full max-w-lg max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col my-auto overflow-hidden">
            <div className="px-6 py-4 border-b border-axdoro-border flex items-center justify-between shrink-0 bg-axdoro-surface">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-axdoro-accent" />
                <div>
                  <h3 className="text-sm font-bold text-axdoro-charcoal">
                    Manage Image: {imageModalCategory.name}
                  </h3>
                  <span className="text-[11px] font-mono text-axdoro-text-muted">
                    /category/{imageModalCategory.slug}
                  </span>
                </div>
              </div>
              <button
                onClick={handleCloseImageModal}
                disabled={isUploadingImage}
                className="p-1.5 text-axdoro-text-muted hover:text-axdoro-charcoal rounded-lg hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategoryImage} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
              {imageModalSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{imageModalSuccess}</span>
                </div>
              )}

              {imageModalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <span>{imageModalError}</span>
                </div>
              )}

              {/* Upload mode tabs */}
              <div className="flex items-center gap-2 border-b border-axdoro-border pb-3">
                <Button
                  type="button"
                  size="sm"
                  variant={!useManualUrl ? 'default' : 'outline'}
                  onClick={() => {
                    setUseManualUrl(false);
                    setImageModalError(null);
                  }}
                  className="text-xs h-8"
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Upload File
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={useManualUrl ? 'default' : 'outline'}
                  onClick={() => {
                    setUseManualUrl(true);
                    setImageModalError(null);
                  }}
                  className="text-xs h-8"
                >
                  <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
                  Direct URL
                </Button>
              </div>

              {!useManualUrl ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Select Replacement File</Label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-axdoro-border hover:border-axdoro-accent rounded-xl p-4 text-center cursor-pointer transition-colors bg-axdoro-surface-muted/30 hover:bg-axdoro-surface-muted/60"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/avif,image/svg+xml,image/gif"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <Upload className="w-6 h-6 mx-auto mb-2 text-axdoro-text-muted" />
                      <p className="text-xs font-semibold text-axdoro-charcoal">
                        {selectedFile ? selectedFile.name : 'Click to select category image'}
                      </p>
                      <p className="text-[11px] text-axdoro-text-muted mt-1">
                        Supports WebP, PNG, JPG, AVIF, SVG (max 10MB)
                      </p>
                    </div>
                  </div>

                  {selectedFile && (
                    <div className="flex items-center justify-between text-xs bg-axdoro-surface-muted p-2.5 rounded-lg border border-axdoro-border">
                      <span className="truncate max-w-[280px] font-mono text-[11px] text-axdoro-charcoal">
                        {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={handleClearSelectedFile}
                        className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <X className="w-3.5 h-3.5" /> Clear
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="category-manual-url" className="text-xs font-semibold">
                    Direct Image URL
                  </Label>
                  <Input
                    id="category-manual-url"
                    type="url"
                    placeholder="https://images.unsplash.com/... or hosted CDN URL"
                    value={manualUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setManualUrl(val);
                      setPreviewUrl(val.trim() || null);
                    }}
                    className="text-xs font-mono"
                  />
                  <p className="text-[11px] text-axdoro-text-muted">
                    Must be a valid HTTP/HTTPS image URL ending in a supported format or hosted on Cloudinary/Unsplash/Pexels.
                  </p>
                </div>
              )}

              {/* Preview Section */}
              <div className="space-y-1.5 pt-2">
                <Label className="text-xs font-semibold">Image Preview</Label>
                <div className="relative rounded-xl overflow-hidden border border-axdoro-border bg-axdoro-surface-muted h-48 flex items-center justify-center">
                  {previewUrl ? (
                    <>
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 flex flex-col justify-end p-4 pointer-events-none">
                        <span className="text-[10px] font-mono uppercase text-white/70 font-semibold tracking-wider">
                          Storefront Preview
                        </span>
                        <h4 className="text-lg font-bold text-white tracking-tight">
                          {imageModalCategory.name}
                        </h4>
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-axdoro-text-muted/60 p-4">
                      <ImageIcon className="w-8 h-8 mx-auto mb-1.5 opacity-50" />
                      <p className="text-xs font-medium">No image selected or assigned</p>
                      <p className="text-[10px]">Select a file above or provide an image URL</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-4 border-t border-axdoro-border flex items-center justify-between gap-3">
                {imageModalCategory.imageUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveCurrentImage}
                    disabled={isUploadingImage}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Remove Image
                  </Button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCloseImageModal}
                    disabled={isUploadingImage}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isUploadingImage || (!useManualUrl && !selectedFile && !manualUrl)}
                    className="shadow-sm"
                  >
                    {isUploadingImage ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Saving Image...
                      </>
                    ) : (
                      'Save Image'
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Homepage Category Section Modal */}
      <CategorySectionModal
        category={selectedSectionCategory}
        isOpen={isSectionModalOpen}
        onClose={() => {
          setIsSectionModalOpen(false);
          setSelectedSectionCategory(null);
        }}
        onSaved={() => {
          loadCategories();
          onCategoryMutated?.();
        }}
        allCategories={categories}
      />

      {/* Homepage Category Sections Reorder Modal */}
      <CategorySectionReorderModal
        isOpen={isReorderModalOpen}
        onClose={() => setIsReorderModalOpen(false)}
        onReordered={() => {
          loadCategories();
          onCategoryMutated?.();
        }}
        categories={categories}
      />
    </div>
  );
};
