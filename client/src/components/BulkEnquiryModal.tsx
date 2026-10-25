import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../types/product.ts';
import { X, Layers, MessageSquare, CheckCircle2, UploadCloud, FileText, Trash2 } from 'lucide-react';
import { normalizeAndValidatePhone } from '../utils/idempotency.ts';
import { useScrollLock } from '../utils/scrollLock.ts';

const MAX_ARTWORK_BYTES = 4 * 1024 * 1024; // 4 MiB (4 * 1024 * 1024 bytes)
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'pdf'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface BulkEnquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefilledProduct?: Product | null;
}

export const BulkEnquiryModal: React.FC<BulkEnquiryModalProps> = ({
  isOpen,
  onClose,
  prefilledProduct,
}) => {
  // Global reference-counted scroll lock while bulk enquiry modal is open
  useScrollLock(isOpen);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [productType, setProductType] = useState(prefilledProduct?.name || 'T-Shirts (140 GSM)');
  const [quantity, setQuantity] = useState('50');
  const [sizeBreakdown, setSizeBreakdown] = useState('S: 10, M: 20, L: 15, XL: 5');
  const [specifications, setSpecifications] = useState(
    prefilledProduct?.fabricSpec ? `${prefilledProduct.fabricSpec} Cotton` : '140 GSM Combed Cotton, Custom Branding'
  );
  const [deliveryRequirement, setDeliveryRequirement] = useState('Within 2-3 weeks');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverWhatsAppUrl, setServerWhatsAppUrl] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');

  // Artwork file state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manage image preview Object URL cleanup
  useEffect(() => {
    if (selectedFile && selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    setPreviewUrl(null);
  }, [selectedFile]);

  // Clean up file state and preview when modal closes or unmounts
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setFileError(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [isOpen]);

  // Sync state when prefilled product changes or modal reopens
  useEffect(() => {
    if (isOpen) {
      if (prefilledProduct) {
        setProductType(prefilledProduct.name);
        setSpecifications(
          prefilledProduct.fabricSpec
            ? `${prefilledProduct.fabricSpec} Cotton`
            : '140 GSM Combed Cotton, Custom Branding'
        );
      } else {
        setProductType('T-Shirts (140 GSM)');
        setSpecifications('140 GSM Combed Cotton, Custom Branding');
      }
      setError(null);
      setFileError(null);
    }
  }, [isOpen, prefilledProduct]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileSelect = (file: File | null) => {
    setFileError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_ARTWORK_BYTES) {
      setFileError('File size exceeds the 4 MB limit (maximum 4 MiB).');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError('Invalid file format. Accepted formats: PNG, JPG, JPEG, WEBP, PDF.');
      return;
    }

    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    // Validate phone with the same strict normalization as checkout
    const phoneValidation = normalizeAndValidatePhone(phone);
    if (!phoneValidation.isValid) {
      setError(phoneValidation.error || 'Please enter a valid phone number (10–15 digits)');
      return;
    }

    if (!email.trim()) {
      setError('Email address is required for enquiry confirmation');
      return;
    }

    if (fileError) {
      setError(fileError);
      return;
    }

    setSubmitting(true);

    try {
      let res: Response;
      if (selectedFile) {
        const formData = new FormData();
        formData.append('enquiryType', 'BULK');
        formData.append('name', name.trim());
        formData.append('phone', phoneValidation.normalized);
        formData.append('email', email.trim());
        formData.append('message', `Requirements: ${specifications}\nTimeline: ${deliveryRequirement}`);
        formData.append('quantity', String(parseInt(quantity, 10) || 50));
        formData.append('sizeBreakdown', sizeBreakdown.trim());
        if (prefilledProduct?.id) {
          formData.append('productId', prefilledProduct.id);
        }
        formData.append('source', 'WEBSITE');
        if (honeypot) {
          formData.append('website_hp', honeypot);
        }
        // Backend artwork field name
        formData.append('artwork', selectedFile);

        res = await fetch('/api/enquiries', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            // Note: Content-Type is intentionally omitted so browser sets multipart/form-data with boundary
          },
          body: formData,
        });
      } else {
        res = await fetch('/api/enquiries', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            enquiryType: 'BULK',
            name: name.trim(),
            phone: phoneValidation.normalized,
            email: email.trim(),
            message: `Requirements: ${specifications}\nTimeline: ${deliveryRequirement}`,
            quantity: parseInt(quantity, 10) || 50,
            sizeBreakdown: sizeBreakdown.trim(),
            productId: prefilledProduct?.id || null,
            source: 'WEBSITE',
            website_hp: honeypot || undefined,
          }),
        });
      }

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || 'Failed to submit enquiry');
      }

      setServerWhatsAppUrl(json.whatsappShareUrl || null);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while submitting');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWhatsAppShare = () => {
    if (serverWhatsAppUrl) {
      window.open(serverWhatsAppUrl, '_blank');
      return;
    }
    const text = encodeURIComponent(
      `Hello AXDORO Team! I would like to enquire about a bulk clothing order:\n` +
      `Product: ${productType}\n` +
      `Estimated Quantity: ${quantity}\n` +
      `Requirements: ${specifications}\n` +
      `Delivery Timeline: ${deliveryRequirement}`
    );
    window.open(`https://wa.me/919941816815?text=${text}`, '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-enquiry-title"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${
          submitted ? 'max-w-lg' : 'max-w-2xl'
        } max-h-[90vh] overflow-y-auto bg-axdoro-surface border border-axdoro-border rounded-2xl shadow-elevated p-6 sm:p-8 my-auto transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-bg border border-axdoro-border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
          aria-label="Close bulk order enquiry"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 text-axdoro-accent-muted text-xs font-bold uppercase tracking-wider mb-2">
          <Layers className="w-4 h-4" />
          <span>Priority Business Flow</span>
        </div>

        <h2 id="bulk-enquiry-title" className="text-2xl sm:text-3xl font-black text-axdoro-charcoal tracking-tight">
          Bulk Clothing Orders Made Simple
        </h2>
        <p className="text-xs sm:text-sm text-axdoro-text-muted mt-2 leading-relaxed">
          Need clothing for a team, event, organisation, business or group requirement? AXDORO focuses on supporting bulk clothing requirements with custom sizing, color curation, and specification matching.
        </p>

        {submitted ? (
          <div className="mt-5 p-6 rounded-2xl border border-emerald-500/30 bg-axdoro-bg/80 text-center space-y-3 shadow-subtle">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-1">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-axdoro-charcoal tracking-tight">Bulk Enquiry Received</h3>
            <p className="text-xs text-axdoro-text-muted max-w-sm mx-auto leading-relaxed">
              Thank you for reaching out. Your enquiry has been recorded in our system.
              Our team will review your specifications and contact you shortly.
            </p>
            <div className="pt-3 flex flex-col sm:flex-row gap-2.5 justify-center">
              <button
                onClick={handleWhatsAppShare}
                className="px-5 py-2.5 rounded-lg bg-[#25D366] hover:bg-[#20ba5a] text-black font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Discuss on WhatsApp (+91 99418 16815)</span>
              </button>
              <button
                onClick={() => {
                  setSubmitted(false);
                  onClose();
                }}
                className="px-5 py-2.5 rounded-lg bg-axdoro-surface-muted hover:bg-axdoro-surface border border-axdoro-border text-axdoro-charcoal text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                Close Window
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Anti-spam honeypot field - visually hidden */}
            <input
              type="text"
              name="website_hp"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-axdoro-charcoal block mb-1">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3 py-2 rounded-lg bg-axdoro-bg border border-axdoro-border-strong text-xs text-axdoro-charcoal placeholder-axdoro-text-muted/60 focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-axdoro-charcoal block mb-1">
                  Mobile Number (+91) <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full px-3 py-2 rounded-lg bg-axdoro-bg border border-axdoro-border-strong text-xs text-axdoro-charcoal placeholder-axdoro-text-muted/60 focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-axdoro-charcoal block mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. team@company.com"
                  className="w-full px-3 py-2 rounded-lg bg-axdoro-bg border border-axdoro-border-strong text-xs text-axdoro-charcoal placeholder-axdoro-text-muted/60 focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-axdoro-charcoal block mb-1">
                  Product / Style Focus
                </label>
                <input
                  type="text"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  placeholder="e.g. 140 GSM Crewneck T-Shirts"
                  className="w-full px-3 py-2 rounded-lg bg-axdoro-bg border border-axdoro-border-strong text-xs text-axdoro-charcoal placeholder-axdoro-text-muted/60 focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-axdoro-charcoal block mb-1">
                  Estimated Quantity (Units)
                </label>
                <input
                  type="number"
                  min="20"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-axdoro-bg border border-axdoro-border-strong text-xs text-axdoro-charcoal placeholder-axdoro-text-muted/60 focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-axdoro-charcoal block mb-1">
                  Size Breakdown (Optional)
                </label>
                <input
                  type="text"
                  value={sizeBreakdown}
                  onChange={(e) => setSizeBreakdown(e.target.value)}
                  placeholder="e.g. S: 10, M: 25, L: 20"
                  className="w-full px-3 py-2 rounded-lg bg-axdoro-bg border border-axdoro-border-strong text-xs text-axdoro-charcoal placeholder-axdoro-text-muted/60 focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-axdoro-charcoal block mb-1">
                Fabric &amp; Specifications (GSM / Branding / Colors)
              </label>
              <textarea
                rows={2}
                value={specifications}
                onChange={(e) => setSpecifications(e.target.value)}
                placeholder="Mention 140 GSM or specific fabric, collar, or color preferences..."
                className="w-full px-3 py-2 rounded-lg bg-axdoro-bg border border-axdoro-border-strong text-xs text-axdoro-charcoal placeholder-axdoro-text-muted/60 focus:outline-none focus:ring-2 focus:ring-axdoro-accent resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-axdoro-charcoal block mb-1">
                Delivery Timeline Request
              </label>
              <input
                type="text"
                value={deliveryRequirement}
                onChange={(e) => setDeliveryRequirement(e.target.value)}
                placeholder="Captured as a customer request, not a guaranteed date"
                className="w-full px-3 py-2 rounded-lg bg-axdoro-bg border border-axdoro-border-strong text-xs text-axdoro-charcoal placeholder-axdoro-text-muted/60 focus:outline-none focus:ring-2 focus:ring-axdoro-accent"
              />
              <span className="text-[10px] text-axdoro-text-muted block mt-1">
                Note: Delivery timeline is captured as an indicative request.
              </span>
            </div>

            {/* Custom Artwork / Logo Attachment */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="bulk-artwork-file" className="text-xs font-bold text-axdoro-charcoal block cursor-pointer">
                  Custom Artwork / Design Attachment (Optional)
                </label>
                <span className="text-[10px] text-axdoro-text-muted">PNG, JPG, WEBP, PDF up to 4 MB</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                id="bulk-artwork-file"
                data-testid="artwork-file-input"
                accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />

              {!selectedFile ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload custom artwork or design file (optional)"
                  data-testid="artwork-dropzone"
                  className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent ${
                    isDragging
                      ? 'border-axdoro-accent bg-axdoro-accent/10 shadow-subtle'
                      : 'border-axdoro-border bg-axdoro-bg hover:border-axdoro-accent/60'
                  }`}
                >
                  <UploadCloud className="w-6 h-6 text-axdoro-accent mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-axdoro-charcoal">
                    Click to browse or drag and drop your logo or design
                  </p>
                  <p className="text-[10px] text-axdoro-text-muted mt-0.5">
                    Accepted formats: PNG, JPG, WEBP, PDF (Max 4 MB)
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-xl bg-axdoro-bg border border-axdoro-border shadow-subtle">
                  <div className="flex items-center gap-3 min-w-0">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Artwork preview"
                        className="w-10 h-10 object-cover rounded-lg border border-axdoro-border flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-axdoro-surface flex items-center justify-center border border-axdoro-border flex-shrink-0">
                        <FileText className="w-5 h-5 text-axdoro-accent" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-axdoro-charcoal truncate" title={selectedFile.name}>
                        {selectedFile.name}
                      </p>
                      <p className="text-[10px] text-axdoro-text-muted font-mono">
                        {formatFileSize(selectedFile.size)} • {selectedFile.name.split('.').pop()?.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-axdoro-accent hover:underline font-semibold px-2 py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent rounded"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      aria-label="Remove artwork attachment"
                      data-testid="remove-artwork-button"
                      className="p-1.5 text-axdoro-text-muted hover:text-red-500 rounded-lg hover:bg-axdoro-surface transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {fileError && (
                <p className="text-[11px] text-red-500 font-medium mt-1.5" role="alert">
                  {fileError}
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="pt-4 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:flex-1 py-3 rounded-lg bg-axdoro-accent hover:bg-axdoro-accent-muted disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-subtle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                {submitting ? 'Submitting Enquiry...' : 'Submit Bulk Order Enquiry'}
              </button>
              <button
                type="button"
                onClick={handleWhatsAppShare}
                className="w-full sm:w-auto px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                <MessageSquare className="w-4 h-4" />
                <span>WhatsApp Directly</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
