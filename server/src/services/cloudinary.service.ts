import crypto from 'crypto';
import { env } from '../config/env.js';

export interface CloudinaryUploadParams {
  productId?: string;
  categoryId?: string;
  hero?: boolean;
  timestamp?: number;
  folder?: string;
  publicId?: string;
}

export interface CloudinarySignedUploadConfig {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  uploadUrl: string;
}

export interface UploadArtworkResult {
  secureUrl: string;
  publicId: string;
  format: string;
  bytes: number;
}

/**
 * Checks whether all required Cloudinary credentials are configured.
 */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET
  );
}

/**
 * Computes a Cloudinary request signature using the Cloudinary algorithm:
 * 1. Sort all parameters alphabetically by key.
 * 2. Join as `key=value&key2=value2`.
 * 3. Append API secret directly (no delimiter).
 * 4. Compute SHA-1 hex digest.
 */
export function signCloudinaryParameters(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const sortedKeys = Object.keys(params).sort();
  const serialized = sortedKeys
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${k}=${params[k]}`)
    .join('&');

  const stringToSign = `${serialized}${apiSecret}`;
  return crypto.createHash('sha1').update(stringToSign).digest('hex');
}

/**
 * Generates secure, short-lived signed upload parameters for admin client uploads.
 * Throws an error if Cloudinary credentials are not configured.
 */
export function generateUploadSignature(
  options: CloudinaryUploadParams
): CloudinarySignedUploadConfig {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary credentials are not configured on this server.');
  }

  const cloudName = env.CLOUDINARY_CLOUD_NAME!;
  const apiKey = env.CLOUDINARY_API_KEY!;
  const apiSecret = env.CLOUDINARY_API_SECRET!;

  const timestamp = options.timestamp || Math.floor(Date.now() / 1000);
  const targetId = options.hero
    ? 'hero'
    : options.categoryId
    ? `cat_${options.categoryId}`
    : (options.productId || 'asset');
  const defaultFolder = options.hero
    ? 'axdoro/hero'
    : options.categoryId
    ? 'axdoro/categories'
    : `axdoro/products/${options.productId || 'general'}`;
  const folder = options.folder || defaultFolder;
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const publicId = options.publicId || `${targetId}_${timestamp}_${randomSuffix}`;

  const paramsToSign: Record<string, string | number> = {
    folder,
    public_id: publicId,
    timestamp,
  };

  const signature = signCloudinaryParameters(paramsToSign, apiSecret);

  return {
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder,
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
  };
}

/**
 * Uploads a customer artwork buffer directly to Cloudinary using authenticated/private storage.
 * Uses 128 bits of cryptographic randomness in the public ID.
 * Returns the Cloudinary public_id, format, size, and secure URL.
 */
export async function uploadArtworkBuffer(options: {
  buffer: Buffer;
  filename: string;
  format: 'png' | 'jpg' | 'webp' | 'pdf';
}): Promise<UploadArtworkResult> {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary credentials are not configured on this server.');
  }

  const cloudName = env.CLOUDINARY_CLOUD_NAME!;
  const apiKey = env.CLOUDINARY_API_KEY!;
  const apiSecret = env.CLOUDINARY_API_SECRET!;
  const timestamp = Math.floor(Date.now() / 1000);

  // 128-bit cryptographic random entropy: 16 bytes = 32 hex chars
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const publicId = `artwork_${timestamp}_${randomSuffix}`;
  const folder = 'axdoro/enquiries/artwork';
  const type = 'authenticated';
  const tags = 'enquiry_artwork,pending_commit';

  const paramsToSign: Record<string, string | number> = {
    folder,
    public_id: publicId,
    tags,
    timestamp,
    type,
  };

  const signature = signCloudinaryParameters(paramsToSign, apiSecret);

  const formData = new FormData();
  const blob = new Blob([options.buffer]);
  formData.append('file', blob, options.filename);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder', folder);
  formData.append('public_id', publicId);
  formData.append('type', type);
  formData.append('tags', tags);

  // For images and PDFs:
  const resourceType = options.format === 'pdf' ? 'auto' : 'image';
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errData?.error?.message || `Cloudinary artwork upload failed with HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    secure_url?: string;
    url?: string;
    public_id: string;
    format?: string;
    bytes?: number;
  };

  return {
    secureUrl: data.secure_url || data.url || '',
    publicId: data.public_id,
    format: data.format || options.format,
    bytes: data.bytes || options.buffer.length,
  };
}

/**
 * Fetches an authenticated customer artwork buffer from Cloudinary for administrative delivery.
 * Zero credentials or tokens are exposed to the browser.
 */
export async function fetchAuthenticatedArtworkBuffer(
  publicId: string,
  format: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isCloudinaryConfigured()) return null;
  const cloudName = env.CLOUDINARY_CLOUD_NAME!;
  const apiKey = env.CLOUDINARY_API_KEY!;
  const apiSecret = env.CLOUDINARY_API_SECRET!;
  const resourceType = format === 'pdf' ? 'image' : 'image';

  // Cloudinary download API with Basic Auth
  const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/download?public_id=${encodeURIComponent(
    publicId
  )}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
    });

    if (!res.ok) {
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const contentType =
      format === 'pdf' ? 'application/pdf' : `image/${format === 'jpg' ? 'jpeg' : format}`;
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch {
    return null;
  }
}

/**
 * Securely deletes an image or artwork asset from Cloudinary.
 * Supports both standard 'upload' assets and private 'authenticated' assets.
 * Fails safely: does not throw if Cloudinary is unconfigured; returns false or true.
 * Never logs credentials.
 */
export async function deleteCloudinaryAsset(
  publicId: string,
  options?: { resourceType?: string; type?: string }
): Promise<boolean> {
  if (!isCloudinaryConfigured()) {
    console.warn(`[Cloudinary] Cannot delete asset '${publicId}': Cloudinary credentials not configured.`);
    return false;
  }

  if (!publicId || typeof publicId !== 'string') {
    return false;
  }

  try {
    const cloudName = env.CLOUDINARY_CLOUD_NAME!;
    const apiKey = env.CLOUDINARY_API_KEY!;
    const apiSecret = env.CLOUDINARY_API_SECRET!;
    const timestamp = Math.floor(Date.now() / 1000);
    const assetType = options?.type || (publicId.includes('artwork_') ? 'authenticated' : 'upload');

    const paramsToSign: Record<string, string | number> = {
      public_id: publicId,
      timestamp,
      type: assetType,
    };

    const signature = signCloudinaryParameters(paramsToSign, apiSecret);

    const formData = new URLSearchParams();
    formData.append('public_id', publicId);
    formData.append('timestamp', String(timestamp));
    formData.append('api_key', apiKey);
    formData.append('signature', signature);
    formData.append('type', assetType);

    const resourceType = options?.resourceType || 'image';
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!res.ok) {
      console.error(`[Cloudinary] Failed to delete asset '${publicId}': HTTP ${res.status}`);
      return false;
    }

    const data = (await res.json()) as { result?: string };
    return data.result === 'ok' || data.result === 'not found';
  } catch (err: unknown) {
    console.error(`[Cloudinary] Error deleting asset '${publicId}':`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * Dynamically modifies tags on a Cloudinary asset (add, remove, or replace).
 * Used for lifecycle transitions (e.g. promoting 'pending_commit' to 'committed').
 */
export async function tagCloudinaryAsset(options: {
  publicId: string;
  tag: string;
  command: 'add' | 'remove' | 'replace';
  resourceType?: string;
  type?: string;
}): Promise<boolean> {
  if (!isCloudinaryConfigured()) return false;
  if (!options.publicId || !options.tag) return false;

  try {
    const cloudName = env.CLOUDINARY_CLOUD_NAME!;
    const apiKey = env.CLOUDINARY_API_KEY!;
    const apiSecret = env.CLOUDINARY_API_SECRET!;
    const timestamp = Math.floor(Date.now() / 1000);
    const assetType = options.type || (options.publicId.includes('artwork_') ? 'authenticated' : 'upload');
    const resourceType = options.resourceType || 'image';

    const paramsToSign: Record<string, string | number> = {
      command: options.command,
      public_ids: options.publicId,
      tag: options.tag,
      timestamp,
      type: assetType,
    };

    const signature = signCloudinaryParameters(paramsToSign, apiSecret);

    const formData = new URLSearchParams();
    formData.append('tag', options.tag);
    formData.append('public_ids[]', options.publicId);
    formData.append('command', options.command);
    formData.append('timestamp', String(timestamp));
    formData.append('api_key', apiKey);
    formData.append('signature', signature);
    formData.append('type', assetType);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/tags`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return res.ok;
  } catch (err: unknown) {
    console.error(`[Cloudinary] Error tagging asset '${options.publicId}':`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

export interface CloudinaryTaggedResource {
  public_id: string;
  created_at: string;
  bytes: number;
  format: string;
  resource_type: string;
  type: string;
}

/**
 * Lists resources bearing a specific tag using Cloudinary's Admin API.
 * Authenticates using HTTP Basic Auth (API Key & Secret).
 */
export async function listCloudinaryResourcesByTag(
  tag: string,
  options?: { resourceType?: string; maxResults?: number }
): Promise<CloudinaryTaggedResource[]> {
  if (!isCloudinaryConfigured()) return [];
  if (!tag) return [];

  const cloudName = env.CLOUDINARY_CLOUD_NAME!;
  const apiKey = env.CLOUDINARY_API_KEY!;
  const apiSecret = env.CLOUDINARY_API_SECRET!;
  const resourceType = options?.resourceType || 'image';
  const maxResults = options?.maxResults || 100;

  const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/tags/${encodeURIComponent(tag)}?max_results=${maxResults}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
    });

    if (!res.ok) {
      console.warn(`[Cloudinary] Failed to list resources by tag '${tag}': HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { resources?: CloudinaryTaggedResource[] };
    return data.resources || [];
  } catch (err: unknown) {
    console.error(`[Cloudinary] Error listing resources by tag '${tag}':`, err instanceof Error ? err.message : String(err));
    return [];
  }
}
