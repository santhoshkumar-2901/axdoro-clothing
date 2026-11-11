import React, { useState } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  FileText,
  Clock,
  ArrowRight,
  Upload,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import {
  submitReturnRequest,
  RETURN_REASON_OPTIONS,
  ReturnReason,
} from '../api/returns';

interface ReturnRequestPageProps {
  onNavigate?: (path: string) => void;
}

const PHONE_REGEX = /^[+]?[0-9]{10,15}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EVIDENCE_FILES = 3;
const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ReturnRequestPage: React.FC<ReturnRequestPageProps> = ({ onNavigate }) => {
  // Form input states
  const [orderId, setOrderId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [description, setDescription] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  // UI & Submission states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Validate individual field or all fields
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    const trimmedOrderId = orderId.trim();
    if (!trimmedOrderId) {
      newErrors.orderId = 'Order ID is required.';
    } else if (trimmedOrderId.length < 3) {
      newErrors.orderId = 'Order ID must be at least 3 characters.';
    } else if (trimmedOrderId.length > 64) {
      newErrors.orderId = 'Order ID cannot exceed 64 characters.';
    }

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      newErrors.phone = 'Phone number is required.';
    } else if (!PHONE_REGEX.test(trimmedPhone)) {
      newErrors.phone = 'Please enter a valid 10 to 15 digit phone number (e.g. +919876543210).';
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      newErrors.email = 'Email address is required.';
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      newErrors.email = 'Please enter a valid email address.';
    } else if (trimmedEmail.length > 255) {
      newErrors.email = 'Email cannot exceed 255 characters.';
    }

    if (!reason) {
      newErrors.reason = 'Please select a reason for your return or exchange.';
    }

    if (description.trim().length > 1000) {
      newErrors.description = 'Description cannot exceed 1000 characters.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    if (evidenceFiles.length + files.length > MAX_EVIDENCE_FILES) {
      setFileError(`You can upload a maximum of ${MAX_EVIDENCE_FILES} evidence images.`);
      e.target.value = '';
      return;
    }

    const validNewFiles: File[] = [];
    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(ext)) {
        setFileError(`Unsupported format for '${file.name}'. Only JPEG, PNG, and WebP images are allowed.`);
        e.target.value = '';
        return;
      }

      if (file.size > MAX_EVIDENCE_BYTES) {
        setFileError(
          `'${file.name}' exceeds the 4 MB limit (${formatFileSize(file.size)}). Please select a smaller image.`
        );
        e.target.value = '';
        return;
      }

      validNewFiles.push(file);
    }

    setEvidenceFiles((prev) => [...prev, ...validNewFiles]);
    e.target.value = '';
  };

  const handleRemoveFile = (indexToRemove: number) => {
    setEvidenceFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setFileError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setServerError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await submitReturnRequest({
        orderId: orderId.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        reason: reason as ReturnReason,
        description: description.trim() || null,
        evidence: evidenceFiles.length > 0 ? evidenceFiles : undefined,
      });

      if (response && response.data && response.data.requestId) {
        setSubmittedReference(response.data.requestId);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        throw new Error('Received unexpected response format from server.');
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to submit return request. Please try again or reach out to customer care.';
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyReference = () => {
    if (!submittedReference) return;
    navigator.clipboard.writeText(submittedReference).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-axdoro-bg text-axdoro-text py-10 sm:py-14 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header Hero */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-axdoro-surface-muted text-axdoro-accent text-xs font-semibold uppercase tracking-wider">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Customer Service</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-axdoro-charcoal tracking-tight">
            Return &amp; Exchange Request
          </h1>
          <p className="text-sm text-axdoro-text-muted max-w-lg mx-auto leading-relaxed">
            Submit your request below. Our team reviews all submissions according to the AXDORO Return &amp; Exchange Policy.
          </p>
        </div>

        {/* Confirmation State View */}
        {submittedReference ? (
          <div
            data-testid="return-success-view"
            className="p-6 sm:p-10 rounded-2xl bg-axdoro-surface border border-axdoro-border shadow-subtle space-y-6"
          >
            <div className="flex items-center gap-4 pb-6 border-b border-axdoro-border">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-axdoro-charcoal">
                  Request Submitted Successfully
                </h2>
                <p className="text-xs text-axdoro-text-muted mt-0.5">
                  Your return request has been recorded and queued for administrative review.
                </p>
              </div>
            </div>

            {/* Reference Box */}
            <div className="p-5 rounded-xl bg-axdoro-surface-muted border border-axdoro-border/70 space-y-2">
              <p className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider">
                Your Return Request Reference
              </p>
              <div className="flex items-center justify-between gap-3 bg-axdoro-surface px-4 py-3 rounded-lg border border-axdoro-border">
                <span
                  data-testid="request-reference-display"
                  className="font-mono text-base sm:text-lg font-bold text-axdoro-accent tracking-wide"
                >
                  {submittedReference}
                </span>
                <button
                  type="button"
                  data-testid="copy-reference-button"
                  onClick={handleCopyReference}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-axdoro-charcoal hover:bg-axdoro-surface-muted transition-colors cursor-pointer border border-axdoro-border"
                  title="Copy reference to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-axdoro-text-muted pt-1">
                Please save this reference code. You will need it if you contact our customer support team.
              </p>
            </div>

            {/* Essential Policy Notice */}
            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/60 text-xs text-amber-950 space-y-2 leading-relaxed">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <Clock className="w-4 h-4 text-amber-700 flex-shrink-0" />
                <span>Review &amp; Evaluation Notice</span>
              </div>
              <p>
                Submitting a return or exchange request does <strong>not</strong> guarantee automatic approval. Every request is manually evaluated against our 7-day delivery policy, product condition requirements (unworn, unwashed, original tags attached), and return exclusions.
              </p>
              <p>
                Our team will review your submission and contact you via your provided phone number or email address with shipping instructions or further updates.
              </p>
            </div>

            {/* Navigation Actions */}
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => onNavigate?.('/return-policy')}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-axdoro-charcoal hover:bg-black text-white text-xs font-semibold transition-colors cursor-pointer shadow-subtle"
              >
                <FileText className="w-4 h-4" />
                <span>Read Return Policy</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate?.('/')}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-axdoro-surface hover:bg-axdoro-surface-muted border border-axdoro-border text-axdoro-charcoal text-xs font-semibold transition-colors cursor-pointer"
              >
                <span>Return to Storefront</span>
              </button>
            </div>
          </div>
        ) : (
          /* Submission Form */
          <form
            onSubmit={handleSubmit}
            noValidate
            className="p-6 sm:p-10 rounded-2xl bg-axdoro-surface border border-axdoro-border shadow-subtle space-y-6"
          >
            {/* 7-Day Eligibility Reminder */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-axdoro-surface-muted border border-axdoro-border/60">
              <Clock className="w-5 h-5 text-axdoro-accent flex-shrink-0" />
              <div className="text-xs text-axdoro-text leading-relaxed">
                <span className="font-bold text-axdoro-charcoal">7-Day Eligibility Policy: </span>
                Requests must be submitted within seven days of delivery with garments unworn, unwashed, and in original packaging with tags intact.
              </div>
            </div>

            {/* Server Error Alert Banner */}
            {serverError && (
              <div
                role="alert"
                data-testid="server-error-banner"
                className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5 leading-relaxed"
              >
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Submission Failed</p>
                  <p>{serverError}</p>
                </div>
              </div>
            )}

            {/* Field 1: Order ID */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="orderId"
                  className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider"
                >
                  Order ID <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-axdoro-text-muted">From your order confirmation</span>
              </div>
              <input
                id="orderId"
                name="orderId"
                type="text"
                value={orderId}
                onChange={(e) => {
                  setOrderId(e.target.value);
                  if (errors.orderId) setErrors((prev) => ({ ...prev, orderId: '' }));
                }}
                disabled={isSubmitting}
                placeholder="e.g. AX-202611-0001"
                aria-invalid={Boolean(errors.orderId)}
                aria-describedby={errors.orderId ? 'orderId-error' : undefined}
                className={`w-full py-2.5 px-3.5 rounded-lg border text-sm text-axdoro-text placeholder:text-neutral-400 bg-white transition-all focus:outline-none ${
                  errors.orderId
                    ? 'border-red-500 focus:ring-2 focus:ring-red-200'
                    : 'border-axdoro-border focus:border-axdoro-accent focus:ring-2 focus:ring-axdoro-accent/20'
                }`}
              />
              {errors.orderId && (
                <p id="orderId-error" className="text-xs text-red-600 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{errors.orderId}</span>
                </p>
              )}
            </div>

            {/* Field 2 & 3: Phone & Email (2 columns on sm screens) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Field 2: Phone */}
              <div className="space-y-1.5">
                <label
                  htmlFor="phone"
                  className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider"
                >
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
                  }}
                  disabled={isSubmitting}
                  placeholder="e.g. +919876543210"
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? 'phone-error' : undefined}
                  className={`w-full py-2.5 px-3.5 rounded-lg border text-sm text-axdoro-text placeholder:text-neutral-400 bg-white transition-all focus:outline-none ${
                    errors.phone
                      ? 'border-red-500 focus:ring-2 focus:ring-red-200'
                      : 'border-axdoro-border focus:border-axdoro-accent focus:ring-2 focus:ring-axdoro-accent/20'
                  }`}
                />
                {errors.phone && (
                  <p id="phone-error" className="text-xs text-red-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{errors.phone}</span>
                  </p>
                )}
              </div>

              {/* Field 3: Email */}
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider"
                >
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  disabled={isSubmitting}
                  placeholder="e.g. customer@example.com"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className={`w-full py-2.5 px-3.5 rounded-lg border text-sm text-axdoro-text placeholder:text-neutral-400 bg-white transition-all focus:outline-none ${
                    errors.email
                      ? 'border-red-500 focus:ring-2 focus:ring-red-200'
                      : 'border-axdoro-border focus:border-axdoro-accent focus:ring-2 focus:ring-axdoro-accent/20'
                  }`}
                />
                {errors.email && (
                  <p id="email-error" className="text-xs text-red-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{errors.email}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Field 4: Reason */}
            <div className="space-y-1.5">
              <label
                htmlFor="reason"
                className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider"
              >
                Reason for Request <span className="text-red-500">*</span>
              </label>
              <select
                id="reason"
                name="reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value as ReturnReason);
                  if (errors.reason) setErrors((prev) => ({ ...prev, reason: '' }));
                }}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.reason)}
                aria-describedby={errors.reason ? 'reason-error' : undefined}
                className={`w-full py-2.5 px-3.5 rounded-lg border text-sm text-axdoro-text bg-white transition-all focus:outline-none cursor-pointer ${
                  errors.reason
                    ? 'border-red-500 focus:ring-2 focus:ring-red-200'
                    : 'border-axdoro-border focus:border-axdoro-accent focus:ring-2 focus:ring-axdoro-accent/20'
                }`}
              >
                <option value="">Select a reason...</option>
                {RETURN_REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.reason && (
                <p id="reason-error" className="text-xs text-red-600 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{errors.reason}</span>
                </p>
              )}
            </div>

            {/* Field 5: Description (Optional) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="description"
                  className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider"
                >
                  Additional Details <span className="text-axdoro-text-muted font-normal">(Optional)</span>
                </label>
                <span className={`text-[11px] ${description.length > 1000 ? 'text-red-600 font-bold' : 'text-axdoro-text-muted'}`}>
                  {description.length} / 1000
                </span>
              </div>
              <textarea
                id="description"
                name="description"
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.description) setErrors((prev) => ({ ...prev, description: '' }));
                }}
                disabled={isSubmitting}
                placeholder="Please describe any sizing discrepancies, garment condition, or defect notes..."
                aria-invalid={Boolean(errors.description)}
                aria-describedby={errors.description ? 'description-error' : undefined}
                className={`w-full py-2.5 px-3.5 rounded-lg border text-sm text-axdoro-text placeholder:text-neutral-400 bg-white transition-all focus:outline-none resize-y ${
                  errors.description
                    ? 'border-red-500 focus:ring-2 focus:ring-red-200'
                    : 'border-axdoro-border focus:border-axdoro-accent focus:ring-2 focus:ring-axdoro-accent/20'
                }`}
              />
              {errors.description && (
                <p id="description-error" className="text-xs text-red-600 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{errors.description}</span>
                </p>
              )}
            </div>

            {/* Field 6: Evidence Images (Optional) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="evidence-input"
                  className="text-xs font-bold text-axdoro-charcoal uppercase tracking-wider"
                >
                  Evidence Images <span className="text-axdoro-text-muted font-normal">(Optional)</span>
                </label>
                <span className="text-[11px] text-axdoro-text-muted">
                  {`${evidenceFiles.length} / ${MAX_EVIDENCE_FILES} uploaded`}
                </span>
              </div>
              <p className="text-[11px] text-axdoro-text-muted leading-relaxed">
                Attach up to 3 photos showing product condition, defect, or incorrect item received. Max 4 MB per image (JPEG, PNG, or WebP).
              </p>

              {/* Upload Dropzone / Button */}
              {evidenceFiles.length < MAX_EVIDENCE_FILES && (
                <label
                  htmlFor="evidence-input"
                  className="flex flex-col items-center justify-center p-4 sm:p-5 rounded-xl border-2 border-dashed border-axdoro-border hover:border-axdoro-accent bg-axdoro-surface hover:bg-axdoro-surface-muted/60 transition-colors cursor-pointer text-center group"
                >
                  <input
                    id="evidence-input"
                    name="evidence"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    disabled={isSubmitting}
                    data-testid="evidence-file-input"
                    className="sr-only"
                  />
                  <Upload className="w-6 h-6 text-axdoro-text-muted group-hover:text-axdoro-accent transition-colors mb-2" />
                  <span className="text-xs font-semibold text-axdoro-charcoal group-hover:text-axdoro-accent">
                    Click to select images or drag and drop
                  </span>
                  <span className="text-[10px] text-axdoro-text-muted mt-0.5">
                    JPEG, PNG, or WebP up to 4 MB each
                  </span>
                </label>
              )}

              {/* Error Alert */}
              {fileError && (
                <div
                  role="alert"
                  data-testid="evidence-file-error"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}

              {/* Selected Files Badges */}
              {evidenceFiles.length > 0 && (
                <div className="space-y-2 pt-1" data-testid="evidence-files-list">
                  {evidenceFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-axdoro-surface-muted border border-axdoro-border/80 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="w-7 h-7 rounded bg-axdoro-surface border border-axdoro-border flex items-center justify-center text-axdoro-text-muted flex-shrink-0">
                          <ImageIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-axdoro-charcoal truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-[10px] text-axdoro-text-muted">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(idx)}
                        disabled={isSubmitting}
                        data-testid={`remove-evidence-file-${idx}`}
                        className="p-1 rounded text-axdoro-text-muted hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer flex-shrink-0"
                        title="Remove image"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Policy Consent Note */}
            <p className="text-[11px] text-axdoro-text-muted leading-relaxed">
              By submitting this form, you acknowledge that return and exchange requests are subject to physical inspection, condition verification, and approval under the{' '}
              <button
                type="button"
                onClick={() => onNavigate?.('/return-policy')}
                className="text-axdoro-accent hover:underline font-semibold cursor-pointer"
              >
                AXDORO Return &amp; Exchange Policy
              </button>
              .
            </p>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="return-submit-button"
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-lg bg-axdoro-charcoal hover:bg-black text-white text-sm font-semibold transition-all shadow-subtle cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Return Request</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer Support Navigation */}
        <div className="text-center pt-2 space-y-3">
          <div className="flex items-center justify-center gap-4 text-xs">
            <button
              type="button"
              onClick={() => onNavigate?.('/return-policy')}
              className="text-axdoro-text-muted hover:text-axdoro-accent transition-colors font-medium cursor-pointer"
            >
              Read Full Policy
            </button>
            <span className="text-axdoro-border">•</span>
            <a
              href="https://wa.me/919941816815?text=Hello%20AXDORO%20Team!%20I%20have%20a%20question%20about%20my%20order."
              target="_blank"
              rel="noopener noreferrer"
              className="text-axdoro-text-muted hover:text-axdoro-accent transition-colors font-medium cursor-pointer"
            >
              WhatsApp Support
            </a>
          </div>

          <div>
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                onNavigate?.('/');
              }}
              className="text-xs text-axdoro-text-muted hover:text-axdoro-charcoal transition-colors font-medium cursor-pointer"
            >
              &larr; Back to AXDORO Storefront
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
