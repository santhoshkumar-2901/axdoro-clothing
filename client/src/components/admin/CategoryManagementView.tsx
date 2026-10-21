import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import {
  AdminCategory,
  adminGetCategories,
  adminCreateCategory,
  adminUpdateCategory,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from '../../api/admin.ts';
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
  const [isSubmittingAdd, setIsSubmittingAdd] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit category modal state
  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editSlug, setEditSlug] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editDisplayOrder, setEditDisplayOrder] = useState<number>(0);
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Global reference-counted scroll lock while add or edit category dialog is open
  useScrollLock(isAddOpen || Boolean(editingCategory));

  // Quick toggle loading state
  const [togglingCategoryId, setTogglingCategoryId] = useState<string | null>(null);

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

  // Handle open Add Modal
  const handleOpenAddModal = () => {
    setAddName('');
    setAddSlug('');
    setIsAddSlugManual(false);
    setAddDescription('');
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

        <Button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 text-xs font-semibold py-2 px-4 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Category</span>
        </Button>
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
                  <TableHead className="font-semibold text-xs">Name</TableHead>
                  <TableHead className="font-mono text-[11px]">Slug / Route</TableHead>
                  <TableHead className="font-semibold text-xs">Description</TableHead>
                  <TableHead className="text-center font-semibold text-xs">Products</TableHead>
                  <TableHead className="text-center font-semibold text-xs">Status</TableHead>
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
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
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
    </div>
  );
};
