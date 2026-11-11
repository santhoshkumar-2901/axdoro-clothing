import React, { useState } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { useScrollLock } from '../../utils/scrollLock.ts';

export interface EvidenceLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnId: string;
  evidence: {
    id: string;
    originalFilename: string;
  } | null;
}

export const EvidenceLightboxModal: React.FC<EvidenceLightboxModalProps> = ({
  isOpen,
  onClose,
  returnId,
  evidence,
}) => {
  useScrollLock(isOpen);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (!isOpen || !evidence) return null;

  const imageUrl = `/api/admin/returns/${returnId}/evidence/${evidence.id}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative max-w-4xl w-full bg-axdoro-surface rounded-xl overflow-hidden shadow-2xl border border-axdoro-border flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-axdoro-border bg-axdoro-surface">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-axdoro-text-muted">
              Evidence Photo:
            </span>
            <span
              id="evidence-preview-title"
              className="text-xs font-bold text-axdoro-charcoal truncate"
              title={evidence.originalFilename}
            >
              {evidence.originalFilename}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-axdoro-text-muted hover:text-axdoro-charcoal rounded-md hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
            aria-label="Close image preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="relative flex-1 min-h-[300px] flex items-center justify-center p-4 bg-axdoro-surface-muted overflow-auto">
          {isLoading && !hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-axdoro-surface-muted/60">
              <Loader2 className="w-8 h-8 animate-spin text-axdoro-accent" />
            </div>
          )}

          {hasError ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center text-axdoro-text-muted">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-sm font-semibold text-axdoro-charcoal">Failed to load evidence image</p>
              <p className="text-xs text-axdoro-text-muted">
                The image could not be retrieved from secure authenticated storage.
              </p>
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={evidence.originalFilename}
              className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg shadow-sm"
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

