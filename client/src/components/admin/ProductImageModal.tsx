import React, { useState, useEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  X,
  Upload,
  Star,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Link as LinkIcon,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Input, Label } from '../ui/input.tsx';
import { Badge } from '../ui/badge.tsx';
import {
  ProductImage,
  adminGetProductDetails,
  adminGetUploadSignature,
  adminAddProductImage,
  adminUpdateProductImage,
  adminSetPrimaryProductImage,
  adminReorderProductImages,
  adminDeleteProductImage,
} from '../../api/admin.ts';
import { useScrollLock } from '../../utils/scrollLock.ts';

interface ProductImageModalProps {
  productId: string;
  productName: string;
  onClose: () => void;
  onImagesUpdated?: () => void;
}

export const ProductImageModal: React.FC<ProductImageModalProps> = ({
  productId,
  productName,
  onClose,
  onImagesUpdated,
}) => {
  // Global reference-counted scroll lock while image modal is open
  useScrollLock(true);

  const [images, setImages] = useState<ProductImage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [cloudinaryAvailable, setCloudinaryAvailable] = useState<boolean>(true);

  // Upload form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [altText, setAltText] = useState<string>('');
  const [manualUrl, setManualUrl] = useState<string>('');
  const [useManualUrl, setUseManualUrl] = useState<boolean>(false);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [availableColors, setAvailableColors] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load product images and available variant colors
  const loadImages = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const details = await adminGetProductDetails(productId);
      setImages(details.images || []);
      const uniqueColors = Array.from(
        new Set((details.variants || []).filter((v) => v.isActive && v.color).map((v) => v.color.trim()))
      );
      setAvailableColors(uniqueColors);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
  }, [productId]);

  // Clean up object preview URL
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setErrorMsg(null);
    }
  };

  const handleClearSelectedFile = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadOrAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsUploading(true);

    try {
      if (useManualUrl) {
        if (!manualUrl.trim()) {
          setErrorMsg('Please enter an image URL.');
          setIsUploading(false);
          return;
        }

        await adminAddProductImage(productId, {
          imageUrl: manualUrl.trim(),
          altText: altText.trim() || undefined,
          color: selectedColor.trim() || undefined,
        });

        setSuccessMsg('Product image added successfully.');
        setManualUrl('');
        setAltText('');
        setSelectedColor('');
        await loadImages();
        onImagesUpdated?.();
        return;
      }

      if (!selectedFile) {
        setErrorMsg('Please select an image file to upload.');
        setIsUploading(false);
        return;
      }

      // Step 1: Request signed upload signature from backend
      let signatureConfig;
      try {
        signatureConfig = await adminGetUploadSignature(productId);
      } catch (err: any) {
        if (err.code === 'CLOUDINARY_NOT_CONFIGURED') {
          setCloudinaryAvailable(false);
          setUseManualUrl(true);
          setErrorMsg(
            'Cloudinary is not configured in server environment. Switched to direct image URL mode.'
          );
          setIsUploading(false);
          return;
        }
        throw err;
      }

      // Step 2: Upload file directly to Cloudinary
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

      // Step 3: Register image in PostgreSQL with Cloudinary metadata and color association
      await adminAddProductImage(productId, {
        imageUrl: cloudData.secure_url || cloudData.url,
        publicId: cloudData.public_id,
        altText: altText.trim() || undefined,
        width: cloudData.width,
        height: cloudData.height,
        format: cloudData.format,
        bytes: cloudData.bytes,
        color: selectedColor.trim() || undefined,
      });

      setSuccessMsg('Image uploaded and linked successfully.');
      handleClearSelectedFile();
      setAltText('');
      setSelectedColor('');
      await loadImages();
      onImagesUpdated?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateImageColor = async (imageId: string, newColor: string) => {
    setActionInProgressId(imageId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await adminUpdateProductImage(productId, imageId, {
        color: newColor.trim() || null,
      });
      setSuccessMsg('Image color association updated.');
      await loadImages();
      onImagesUpdated?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update image color');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleSetPrimary = async (imageId: string) => {
    setActionInProgressId(imageId);
    setErrorMsg(null);
    try {
      await adminSetPrimaryProductImage(productId, imageId);
      await loadImages();
      onImagesUpdated?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to set primary image');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!window.confirm('Are you sure you want to delete this product image?')) {
      return;
    }
    setActionInProgressId(imageId);
    setErrorMsg(null);
    try {
      await adminDeleteProductImage(productId, imageId);
      await loadImages();
      onImagesUpdated?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete image');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const newImages = [...images];
    const temp = newImages[index];
    newImages[index] = newImages[targetIndex];
    newImages[targetIndex] = temp;

    const reorderPayload = newImages.map((img, idx) => ({
      id: img.id,
      displayOrder: idx,
    }));

    setIsLoading(true);
    setErrorMsg(null);
    try {
      await adminReorderProductImages(productId, reorderPayload);
      await loadImages();
      onImagesUpdated?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reorder images');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in">
      <div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
        <Card className="border-axdoro-border bg-axdoro-surface shadow-elevated rounded-2xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between px-6 py-4 border-b border-axdoro-border bg-axdoro-surface shrink-0">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-axdoro-accent" />
                <CardTitle className="text-base font-bold text-axdoro-charcoal">
                  Manage Product Images
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-axdoro-text-muted">
                {productName} &bull; Upload, organize, set primary, and manage assets
              </CardDescription>
            </div>
            <button
              onClick={onClose}
              className="text-axdoro-text-muted hover:text-axdoro-charcoal p-1.5 rounded-lg hover:bg-axdoro-bg transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </CardHeader>

          <CardContent className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            {/* Feedback messages */}
            {errorMsg && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Existing Images Gallery */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-axdoro-text-muted">
                  Current Images ({images.length})
                </h3>
                {images.length > 0 && (
                  <span className="text-[11px] text-axdoro-text-muted">
                    Drag or use arrows to change display order
                  </span>
                )}
              </div>

              {isLoading ? (
                <div className="py-8 flex flex-col items-center justify-center text-axdoro-text-muted text-xs gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-axdoro-accent" />
                  <span>Loading product images...</span>
                </div>
              ) : images.length === 0 ? (
                <div className="p-6 border border-dashed border-axdoro-border rounded-xl text-center text-xs text-axdoro-text-muted bg-axdoro-bg/50">
                  No images uploaded yet. Use the upload form below to add the first image.
                </div>
              ) : (
                <div className="space-y-2">
                  {images.map((img, index) => (
                    <div
                      key={img.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                        img.isPrimary
                          ? 'border-axdoro-accent/40 bg-axdoro-accent/5'
                          : 'border-axdoro-border bg-axdoro-surface'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Thumbnail */}
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-axdoro-border shrink-0 bg-axdoro-bg">
                          <img
                            src={img.imageUrl}
                            alt={img.altText || productName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'https://placehold.co/100x100?text=No+Preview';
                            }}
                          />
                        </div>

                        {/* Metadata */}
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            {img.isPrimary && (
                              <Badge variant="success" className="text-[10px] py-0 px-1.5">
                                <Star className="w-3 h-3 mr-0.5 fill-current inline" /> Primary
                              </Badge>
                            )}
                            <span className="text-[11px] font-mono text-axdoro-text-muted">
                              Order #{img.displayOrder}
                            </span>
                          </div>
                          <p className="text-xs text-axdoro-charcoal truncate max-w-xs font-medium">
                            {img.altText || <span className="italic text-axdoro-text-muted">No alt text</span>}
                          </p>
                          <p className="text-[10px] font-mono text-axdoro-text-muted truncate max-w-xs">
                            {img.publicId ? (
                              <span>ID: {img.publicId}</span>
                            ) : (
                              <span>URL: {img.imageUrl}</span>
                            )}
                            {img.width && img.height ? ` • ${img.width}x${img.height}` : null}
                            {img.format ? ` • ${img.format.toUpperCase()}` : null}
                          </p>
                          {/* Color Variant Association */}
                          <div className="flex items-center gap-1.5 pt-1">
                            <span className="text-[10px] font-bold uppercase text-axdoro-text-muted">Color:</span>
                            <select
                              value={img.color || ''}
                              disabled={actionInProgressId === img.id}
                              onChange={(e) => handleUpdateImageColor(img.id, e.target.value)}
                              className="text-xs h-6 px-1.5 rounded border border-axdoro-border bg-axdoro-surface text-axdoro-charcoal focus:ring-1 focus:ring-axdoro-accent cursor-pointer"
                              title="Assign image to variant color"
                            >
                              <option value="">Shared / All Colors</option>
                              {availableColors.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {/* Ordering arrows */}
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={index === 0 || actionInProgressId === img.id}
                            onClick={() => handleMove(index, 'up')}
                            className="p-1 rounded text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-bg disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                            title="Move up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={index === images.length - 1 || actionInProgressId === img.id}
                            onClick={() => handleMove(index, 'down')}
                            className="p-1 rounded text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-bg disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                            title="Move down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {!img.isPrimary && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2"
                            disabled={actionInProgressId === img.id}
                            onClick={() => handleSetPrimary(img.id)}
                            title="Make primary product image"
                          >
                            Set Primary
                          </Button>
                        )}

                        <Button
                          variant="destructive"
                          size="sm"
                          className="text-xs h-7 w-7 p-0"
                          disabled={actionInProgressId === img.id}
                          onClick={() => handleDelete(img.id)}
                          title="Delete image"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upload / Add Image Section */}
            <div className="pt-2 border-t border-axdoro-border/60">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-axdoro-text-muted">
                    Add New Image
                  </h3>
                  {!cloudinaryAvailable && (
                    <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      Direct URL Mode
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setUseManualUrl(!useManualUrl)}
                  className="text-xs text-axdoro-accent hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {useManualUrl ? (
                    <>
                      <Upload className="w-3 h-3" /> Upload file
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-3 h-3" /> Or enter image URL
                    </>
                  )}
                </button>
              </div>

              <form onSubmit={handleUploadOrAdd} className="space-y-3">
                {!useManualUrl ? (
                  /* File upload mode */
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        onChange={handleFileChange}
                        className="hidden"
                        id="image-file-upload"
                      />
                      <label
                        htmlFor="image-file-upload"
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-axdoro-border hover:border-axdoro-accent rounded-xl bg-axdoro-bg/30 hover:bg-axdoro-bg/60 cursor-pointer text-xs text-axdoro-charcoal transition-colors"
                      >
                        <Upload className="w-4 h-4 text-axdoro-accent" />
                        <span>{selectedFile ? selectedFile.name : 'Choose image file (PNG, JPG, WebP)...'}</span>
                      </label>

                      {selectedFile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleClearSelectedFile}
                          className="h-8 px-2 text-xs text-axdoro-text-muted hover:text-red-600"
                        >
                          Clear
                        </Button>
                      )}
                    </div>

                    {previewUrl && (
                      <div className="flex items-center gap-3 p-2 bg-axdoro-bg/40 rounded-xl border border-axdoro-border">
                        <img
                          src={previewUrl}
                          alt="Upload preview"
                          className="w-14 h-14 object-cover rounded-lg border border-axdoro-border shrink-0"
                        />
                        <div className="text-xs space-y-0.5">
                          <p className="font-semibold text-axdoro-charcoal">{selectedFile?.name}</p>
                          <p className="text-[11px] text-axdoro-text-muted">
                            Size: {selectedFile ? Math.round(selectedFile.size / 1024) : 0} KB
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Direct URL mode */
                  <div className="space-y-1">
                    <Label htmlFor="manual-img-url" className="text-xs">
                      Image URL
                    </Label>
                    <Input
                      id="manual-img-url"
                      type="url"
                      placeholder="https://res.cloudinary.com/... or https://example.com/image.jpg"
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="image-alt-text" className="text-xs">
                    Alt Text (Accessibility & SEO)
                  </Label>
                  <Input
                    id="image-alt-text"
                    type="text"
                    placeholder="e.g. Front view of Classic Oversized Tee in Charcoal"
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    className="text-xs"
                  />
                </div>

                {availableColors.length > 0 && (
                  <div className="space-y-1">
                    <Label htmlFor="image-color-variant" className="text-xs">
                      Assign to Color Variant (Optional)
                    </Label>
                    <select
                      id="image-color-variant"
                      value={selectedColor}
                      onChange={(e) => setSelectedColor(e.target.value)}
                      className="w-full text-xs h-9 px-2.5 rounded-md border border-axdoro-border bg-axdoro-surface text-axdoro-charcoal focus:ring-1 focus:ring-axdoro-accent"
                    >
                      <option value="">Shared / All Colors</option>
                      {availableColors.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isUploading || (!selectedFile && !manualUrl.trim())}
                    className="text-xs"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 mr-1.5" />
                        {useManualUrl ? 'Add Image' : 'Upload Image'}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end border-t border-axdoro-border px-6 py-4 bg-axdoro-surface-muted/30 shrink-0">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Close
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
