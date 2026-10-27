import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  QrCode,
  Edit,
  Save,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import {
  adminGetPaymentQr,
  adminGetPaymentQrUploadSignature,
  adminUpdatePaymentQr,
} from '../../api/admin.ts';
import { PaymentQrSetting } from '../../types/product.ts';
import { Button } from '../ui/button.tsx';
import { Input, Label } from '../ui/input.tsx';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../ui/card.tsx';
import { useScrollLock } from '../../utils/scrollLock.ts';

export const PaymentSettingsView: React.FC = () => {
  // Payment QR Code state
  const [paymentQrSetting, setPaymentQrSetting] = useState<PaymentQrSetting | null>(null);
  const [isLoadingPaymentQr, setIsLoadingPaymentQr] = useState<boolean>(true);
  const [isPaymentQrModalOpen, setIsPaymentQrModalOpen] = useState<boolean>(false);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrManualUrl, setQrManualUrl] = useState<string>('');
  const [useQrManualUrl, setUseQrManualUrl] = useState<boolean>(false);
  const [qrUpiId, setQrUpiId] = useState<string>('');
  const [qrModalError, setQrModalError] = useState<string | null>(null);
  const [isSavingQr, setIsSavingQr] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const qrFileInputRef = useRef<HTMLInputElement>(null);

  // Global background scroll lock while Payment QR modal is open
  useScrollLock(isPaymentQrModalOpen);

  // Load authoritative payment QR settings from API
  const loadPaymentQr = useCallback(async () => {
    setIsLoadingPaymentQr(true);
    setErrorMessage(null);
    try {
      const res = await adminGetPaymentQr();
      setPaymentQrSetting(res);
    } catch (err) {
      console.warn('[PaymentSettingsView] Failed to load payment QR setting:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load payment settings');
    } finally {
      setIsLoadingPaymentQr(false);
    }
  }, []);

  useEffect(() => {
    loadPaymentQr();
  }, [loadPaymentQr]);

  // Clean up object preview URLs
  useEffect(() => {
    return () => {
      if (qrPreviewUrl && qrPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(qrPreviewUrl);
      }
    };
  }, [qrPreviewUrl]);

  // Close modal on Escape key
  useEffect(() => {
    if (!isPaymentQrModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSavingQr) {
        handleCloseQrModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaymentQrModalOpen, isSavingQr]);

  const handleOpenQrModal = () => {
    setQrFile(null);
    setQrPreviewUrl(paymentQrSetting?.imageUrl || null);
    setQrManualUrl(paymentQrSetting?.imageUrl || '');
    setUseQrManualUrl(false);
    setQrUpiId(paymentQrSetting?.upiId || '');
    setQrModalError(null);
    setIsPaymentQrModalOpen(true);
  };

  const handleCloseQrModal = () => {
    if (qrPreviewUrl && qrPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(qrPreviewUrl);
    }
    setQrFile(null);
    setQrPreviewUrl(null);
    setQrManualUrl('');
    setQrModalError(null);
    setIsPaymentQrModalOpen(false);
  };

  const handleQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setQrModalError('Only JPEG, PNG, or WEBP images are supported for QR codes.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setQrModalError('QR image file exceeds maximum 5 MB limit.');
      return;
    }

    setQrFile(file);
    setQrModalError(null);
    const objectUrl = URL.createObjectURL(file);
    setQrPreviewUrl(objectUrl);
  };

  const handleClearQrSelectedFile = () => {
    if (qrPreviewUrl && qrPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(qrPreviewUrl);
    }
    setQrFile(null);
    setQrPreviewUrl(paymentQrSetting?.imageUrl || null);
    if (qrFileInputRef.current) {
      qrFileInputRef.current.value = '';
    }
  };

  const handleSaveQr = async () => {
    const trimmedUpi = qrUpiId.trim();
    if (!trimmedUpi) {
      setQrModalError('UPI ID is required (e.g. yourhandle@bank)');
      return;
    }

    setIsSavingQr(true);
    setQrModalError(null);

    try {
      let finalImageUrl: string | null = paymentQrSetting?.imageUrl || null;
      let finalPublicId: string | null | undefined = paymentQrSetting?.publicId;

      if (useQrManualUrl) {
        const trimmed = qrManualUrl.trim();
        if (!trimmed) {
          throw new Error('Please enter a valid image URL or relative asset path');
        }
        finalImageUrl = trimmed;
        finalPublicId = null;
      } else if (qrFile) {
        // Authenticated signature for payment folder
        const sig = await adminGetPaymentQrUploadSignature();
        const formData = new FormData();
        formData.append('file', qrFile);
        formData.append('api_key', sig.apiKey);
        formData.append('timestamp', String(sig.timestamp));
        formData.append('signature', sig.signature);
        formData.append('folder', sig.folder);
        formData.append('public_id', sig.publicId);

        const uploadRes = await fetch(
          sig.uploadUrl || `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Failed to upload QR code to Cloudinary');
        }

        const data = await uploadRes.json();
        finalImageUrl = data.secure_url;
        finalPublicId = data.public_id;
      }

      if (!finalImageUrl) {
        throw new Error('Please provide a QR image file or URL');
      }

      const updated = await adminUpdatePaymentQr({
        imageUrl: finalImageUrl,
        publicId: finalPublicId,
        upiId: trimmedUpi,
      });

      setPaymentQrSetting(updated);
      handleCloseQrModal();
      setSuccessMessage('UPI payment QR settings updated successfully.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setQrModalError(err instanceof Error ? err.message : 'Failed to update payment QR settings');
    } finally {
      setIsSavingQr(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-axdoro-charcoal flex items-center gap-2">
            <QrCode className="w-5 h-5 text-axdoro-accent" />
            Payment Settings &amp; Storefront QR
          </h2>
          <p className="text-xs text-axdoro-text-muted mt-0.5">
            Configure the dynamic UPI payment QR code and UPI ID displayed in the checkout modal and order confirmation view.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadPaymentQr}
            disabled={isLoadingPaymentQr}
            className="text-xs border-axdoro-border gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPaymentQr ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleOpenQrModal}
            disabled={isLoadingPaymentQr}
            className="text-xs font-semibold px-3 shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>Configure Payment QR</span>
          </Button>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs flex items-center gap-2.5 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Storefront UPI Payment QR Code Card */}
      <Card className="border-axdoro-border bg-axdoro-surface shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-axdoro-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-axdoro-charcoal flex items-center gap-2">
                <QrCode className="w-4 h-4 text-axdoro-accent" />
                Storefront UPI Payment QR Code
              </CardTitle>
              <CardDescription className="text-xs text-axdoro-text-muted mt-0.5">
                The active QR code image and UPI ID presented to customers in the checkout modal and order confirmation screen.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleOpenQrModal}
                disabled={isLoadingPaymentQr}
                className="h-8 text-xs font-semibold px-3 shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Configure Payment QR</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* QR Preview Thumbnail */}
            <div className="relative w-36 h-36 rounded-xl overflow-hidden border border-axdoro-border bg-white p-2 shadow-sm flex-shrink-0 flex items-center justify-center">
              {paymentQrSetting?.imageUrl ? (
                <img
                  src={paymentQrSetting.imageUrl}
                  alt="Current UPI QR Code"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-2 text-stone-400">
                  <QrCode className="w-8 h-8 mx-auto mb-1 opacity-50" />
                  <span className="text-[10px]">No QR Set</span>
                </div>
              )}
            </div>

            {/* QR Meta & Instructions */}
            <div className="space-y-2.5 text-xs text-axdoro-text-muted flex-1 text-left">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                <div>
                  <span className="text-axdoro-text-muted/60">Status: </span>
                  <span className="text-axdoro-charcoal font-semibold">
                    {paymentQrSetting?.imageUrl ? 'Active (Configured)' : 'Missing Configuration'}
                  </span>
                </div>
                {paymentQrSetting?.updatedAt && (
                  <div>
                    <span className="text-axdoro-text-muted/60">Updated: </span>
                    <span className="text-axdoro-charcoal font-semibold">
                      {new Date(paymentQrSetting.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <span className="text-axdoro-text-muted font-medium">Configured UPI ID: </span>
                <span className="font-mono font-bold text-axdoro-charcoal bg-axdoro-surface-muted px-2 py-0.5 rounded border border-axdoro-border">
                  {paymentQrSetting?.upiId || 'Not configured'}
                </span>
              </div>

              <p className="text-[11px] text-axdoro-text-muted leading-relaxed">
                Direct checkout flow allows customers to scan this QR code, transfer funds via their UPI app (PhonePe, Google Pay, Paytm, etc.), copy the exact UPI ID, and submit their payment screenshot on WhatsApp.
              </p>

              <div className="flex items-center gap-2 pt-1 text-[11px]">
                {paymentQrSetting?.imageUrl && (
                  <a
                    href={paymentQrSetting.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-axdoro-accent hover:underline font-semibold"
                  >
                    <span>Inspect active QR code</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informational Guidance Card */}
      <Card className="border-axdoro-border bg-axdoro-surface/60 shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-axdoro-accent-muted flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-axdoro-text-muted">
              <span className="font-bold text-axdoro-charcoal block">Verification &amp; Security Note</span>
              <p className="leading-relaxed">
                Changes made here take effect immediately on the live storefront checkout modal without requiring a redeployment.
                All updates are tamper-evident and recorded in the <strong>Security Audit Trail</strong>. Ensure that the UPI ID matches the destination bank account embedded in your QR code.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment QR Configuration Dialog Modal */}
      {isPaymentQrModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overscroll-contain animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
          onClick={handleCloseQrModal}
        >
          <Card
            className="w-full max-w-lg bg-axdoro-surface border-axdoro-border shadow-elevated overflow-hidden my-auto max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3.5rem)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="p-4 sm:p-5 border-b border-axdoro-border flex flex-row items-center justify-between shrink-0">
              <div>
                <CardTitle id="qr-modal-title" className="text-base font-bold text-axdoro-charcoal flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-axdoro-accent" />
                  Configure UPI Payment QR &amp; ID
                </CardTitle>
                <CardDescription className="text-xs text-axdoro-text-muted mt-0.5">
                  Upload a replacement payment QR code or enter an approved asset path, and specify the merchant UPI ID.
                </CardDescription>
              </div>
              <button
                type="button"
                onClick={handleCloseQrModal}
                disabled={isSavingQr}
                className="p-1.5 rounded-lg text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1 min-h-0 overscroll-contain">
              {qrModalError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-900 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>{qrModalError}</span>
                </div>
              )}

              {/* UPI ID Field */}
              <div className="space-y-1.5">
                <Label htmlFor="qr-upi-id-input" className="text-xs font-semibold text-axdoro-charcoal block">
                  Configured UPI ID (Virtual Payment Address) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="qr-upi-id-input"
                  type="text"
                  value={qrUpiId}
                  onChange={(e) => {
                    setQrUpiId(e.target.value);
                    setQrModalError(null);
                  }}
                  placeholder="e.g. storename@okaxis"
                  className="text-xs font-mono"
                />
                <p className="text-[11px] text-axdoro-text-muted">
                  This ID is displayed to customers for quick copying in both the checkout card and order confirmation view.
                </p>
              </div>

              {/* Source Toggle: Upload vs Direct URL */}
              <div className="flex items-center justify-between pt-2 border-t border-axdoro-border/60">
                <span className="text-xs font-semibold text-axdoro-charcoal">QR Code Image Source</span>
                <div className="flex items-center gap-1 bg-axdoro-surface-muted p-0.5 rounded-md border border-axdoro-border/60">
                  <button
                    type="button"
                    onClick={() => {
                      setUseQrManualUrl(false);
                      setQrModalError(null);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                      !useQrManualUrl
                        ? 'bg-axdoro-charcoal text-white shadow-xs'
                        : 'text-axdoro-text-muted hover:text-axdoro-charcoal'
                    }`}
                  >
                    File Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseQrManualUrl(true);
                      setQrModalError(null);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                      useQrManualUrl
                        ? 'bg-axdoro-charcoal text-white shadow-xs'
                        : 'text-axdoro-text-muted hover:text-axdoro-charcoal'
                    }`}
                  >
                    Direct URL
                  </button>
                </div>
              </div>

              {/* QR Image Preview */}
              <div className="space-y-1.5">
                <Label className="text-xs text-axdoro-text-muted block">QR Code Preview</Label>
                <div className="w-32 h-32 mx-auto rounded-xl overflow-hidden border-2 border-dashed border-axdoro-border bg-white p-2 flex items-center justify-center relative shadow-sm">
                  {(() => {
                    const activePreview = useQrManualUrl ? qrManualUrl.trim() : qrPreviewUrl;
                    return activePreview ? (
                      <img
                        src={activePreview}
                        alt="UPI QR Preview"
                        className="w-full h-full object-contain"
                        onError={() => {
                          setQrModalError('Unable to load QR image from the specified path/URL.');
                        }}
                      />
                    ) : (
                      <div className="text-center p-2 text-stone-400">
                        <QrCode className="w-8 h-8 mx-auto mb-1 opacity-50" />
                        <span className="text-[10px]">No image selected</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {!useQrManualUrl ? (
                /* File Upload Area */
                <div className="space-y-2">
                  <input
                    ref={qrFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleQrFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => qrFileInputRef.current?.click()}
                    className="p-4 border-2 border-dashed border-axdoro-border hover:border-axdoro-accent rounded-xl text-center cursor-pointer transition-colors bg-axdoro-surface-muted/40 hover:bg-axdoro-surface-muted/80"
                  >
                    <Upload className="w-6 h-6 mx-auto text-axdoro-accent mb-1" />
                    <span className="text-xs font-semibold text-axdoro-charcoal block">
                      {qrFile ? qrFile.name : 'Choose replacement QR file'}
                    </span>
                    <span className="text-[11px] text-axdoro-text-muted mt-0.5 block">
                      PNG, JPG, or WEBP up to 5 MB. Square aspect ratio recommended.
                    </span>
                  </div>

                  {qrFile && (
                    <div className="flex items-center justify-between text-xs bg-axdoro-surface-muted px-3 py-1.5 rounded-md">
                      <span className="truncate max-w-xs font-mono text-[11px] text-axdoro-charcoal">{qrFile.name}</span>
                      <button
                        type="button"
                        onClick={handleClearQrSelectedFile}
                        className="text-red-500 hover:text-red-700 text-xs font-semibold cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Direct URL Input */
                <div className="space-y-1.5">
                  <Label htmlFor="qr-manual-url-input" className="text-xs text-axdoro-text-muted block">
                    Direct Image URL or Relative Asset Path
                  </Label>
                  <Input
                    id="qr-manual-url-input"
                    type="url"
                    value={qrManualUrl}
                    onChange={(e) => {
                      setQrManualUrl(e.target.value);
                      setQrModalError(null);
                    }}
                    placeholder="/upi-qr.png or https://res.cloudinary.com/..."
                    className="text-xs font-mono"
                  />
                  <p className="text-[11px] text-axdoro-text-muted">
                    Supports relative paths (e.g. /upi-qr.png) or approved HTTPS image CDNs.
                  </p>
                </div>
              )}
            </CardContent>

            <div className="p-4 border-t border-axdoro-border flex items-center justify-end gap-2 flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCloseQrModal}
                disabled={isSavingQr}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveQr}
                disabled={isSavingQr || !qrUpiId.trim()}
                className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {isSavingQr ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Payment Settings</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
