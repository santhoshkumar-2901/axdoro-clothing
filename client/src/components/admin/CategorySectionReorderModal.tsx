import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { AdminCategory, adminReorderCategorySections } from '../../api/admin.ts';
import { Button } from '../ui/button.tsx';
import { Badge } from '../ui/badge.tsx';
import { useScrollLock } from '../../utils/scrollLock.ts';

interface CategorySectionReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReordered: () => void;
  categories: AdminCategory[];
}

interface ReorderableSectionItem {
  sectionId: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  heading: string;
  isEnabled: boolean;
  displayOrder: number;
}

export const CategorySectionReorderModal: React.FC<CategorySectionReorderModalProps> = ({
  isOpen,
  onClose,
  onReordered,
  categories,
}) => {
  useScrollLock(isOpen);

  const [sections, setSections] = useState<ReorderableSectionItem[]>(() => {
    return categories
      .filter((c) => Boolean(c.section))
      .map((c) => ({
        sectionId: c.section!.id,
        categoryId: c.id,
        categoryName: c.name,
        categorySlug: c.slug,
        heading: c.section!.heading || c.name,
        isEnabled: c.section!.isEnabled,
        displayOrder: c.section!.displayOrder ?? 0,
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder);
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccess(null);

    // Extract all categories that have configured sections (both enabled and disabled)
    const configured: ReorderableSectionItem[] = categories
      .filter((c) => Boolean(c.section))
      .map((c) => ({
        sectionId: c.section!.id,
        categoryId: c.id,
        categoryName: c.name,
        categorySlug: c.slug,
        heading: c.section!.heading || c.name,
        isEnabled: c.section!.isEnabled,
        displayOrder: c.section!.displayOrder ?? 0,
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder);

    setSections(configured);
  }, [isOpen, categories]);

  if (!isOpen) return null;

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;
    const updated = [...sections];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setSections(updated);
  };

  const handleSave = async () => {
    if (sections.length === 0) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    // Backend requires all configured sections (including disabled ones) in orderedSectionIds
    const orderedSectionIds = sections.map((s) => s.sectionId);

    try {
      await adminReorderCategorySections(orderedSectionIds);
      setSuccess('Section display orders updated successfully.');
      onReordered();
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err?.message || 'Failed to update section display order');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reorder-sections-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative w-full max-w-lg bg-axdoro-surface border border-axdoro-border rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-axdoro-border bg-axdoro-surface-muted/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-axdoro-purple/10 text-axdoro-purple flex items-center justify-center">
              <ArrowUpDown className="w-5 h-5" />
            </div>
            <div>
              <h2 id="reorder-sections-title" className="text-base font-bold text-axdoro-charcoal">
                Reorder Homepage Sections
              </h2>
              <p className="text-xs text-axdoro-text-muted mt-0.5">
                Adjust section sequence on the storefront
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

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
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

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              All configured sections (both enabled and disabled) are listed below. Use the arrows to position each section relative to the others.
            </p>
          </div>

          {sections.length === 0 ? (
            <p className="text-center py-8 text-xs text-axdoro-text-muted">
              No categories currently have homepage sections configured.
            </p>
          ) : (
            <div className="space-y-2">
              {sections.map((item, index) => (
                <div
                  key={item.sectionId}
                  className="flex items-center justify-between p-3 bg-white rounded-xl border border-axdoro-border shadow-xs hover:border-axdoro-purple/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-mono text-xs font-bold text-axdoro-text-muted">
                      #{index + 1}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-axdoro-charcoal">{item.heading}</p>
                      <p className="text-[11px] text-axdoro-text-muted">
                        Category: {item.categoryName} (/category/{item.categorySlug})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={item.isEnabled ? 'success' : 'outline'}
                      className="text-[10px] font-mono py-0.5"
                    >
                      {item.isEnabled ? 'Enabled' : 'Disabled'}
                    </Badge>

                    <div className="flex items-center gap-1 border-l border-axdoro-border pl-2">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMove(index, 'up')}
                        className="p-1 rounded hover:bg-axdoro-surface-muted text-axdoro-text-muted hover:text-axdoro-charcoal disabled:opacity-30 cursor-pointer"
                        title="Move Up"
                        aria-label={`Move ${item.heading} up`}
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={index === sections.length - 1}
                        onClick={() => handleMove(index, 'down')}
                        className="p-1 rounded hover:bg-axdoro-surface-muted text-axdoro-text-muted hover:text-axdoro-charcoal disabled:opacity-30 cursor-pointer"
                        title="Move Down"
                        aria-label={`Move ${item.heading} down`}
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-axdoro-border bg-axdoro-surface-muted/50">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isSaving || sections.length === 0}
            onClick={handleSave}
            className="text-xs font-semibold px-4"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Saving...
              </>
            ) : (
              'Save Section Order'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
